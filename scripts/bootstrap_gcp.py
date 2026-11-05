#!/usr/bin/env python3
"""One-time, keyless Google Cloud setup. Run in authenticated Google Cloud Shell.

No credentials are read or exported. --plan is offline; the normal command checks
project/billing before provisioning only the named SNR NEST deployment resources.
"""

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

MARKER = "Managed by the SNR NEST deployment bootstrap."
APIS = (
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
)
MAPPING = {
    "google.subject": "assertion.sub",
    "attribute.repository": "assertion.repository",
    "attribute.ref": "assertion.ref",
}


class SetupError(Exception):
    """An actionable prerequisite or conflicting resource."""


@dataclass(frozen=True)
class SetupConfig:
    project: str
    site_url: str
    region: str = "asia-south1"
    repository: str = "Marykamalaperli/SNR_website"

    def __post_init__(self):
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", self.project):
            raise SetupError("Use the actual Google Project ID (6–30 lowercase characters).")
        if not re.fullmatch(r"[a-z]+-[a-z]+[0-9]+", self.region):
            raise SetupError("Use a Google region such as asia-south1.")
        if not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", self.repository):
            raise SetupError("Use an owner/repository GitHub identity.")
        origin = urlsplit(self.site_url)
        if (
            origin.scheme != "https"
            or not origin.hostname
            or origin.path not in ("", "/")
            or origin.username
            or origin.password
            or origin.port
            or origin.query
            or origin.fragment
        ):
            raise SetupError("Use the actual public frontend HTTPS origin.")
        object.__setattr__(self, "site_url", f"https://{origin.hostname}")

    @property
    def condition(self):
        return f"assertion.repository == '{self.repository}' && assertion.ref == 'refs/heads/main'"


class Gcloud:
    def __init__(self, project):
        self.project = project

    def __call__(self, *args):
        command = ["gcloud", *args, f"--project={self.project}", "--quiet", "--format=json"]
        try:
            result = subprocess.run(command, check=True, text=True, stdout=subprocess.PIPE)
        except FileNotFoundError as exc:
            raise SetupError("Open Google Cloud Shell; gcloud is not installed here.") from exc
        except subprocess.CalledProcessError as exc:
            raise SetupError(
                f"Google Cloud command failed ({exc.returncode}). "
                "Read the Google CLI error above and verify the account's project permissions."
            ) from exc
        return json.loads(result.stdout) if result.stdout.strip() else None


def named(resources, resource_id):
    return next(
        (item for item in resources or [] if item.get("name", "").split("/")[-1] == resource_id),
        None,
    )


def require_managed(resource, kind):
    if resource.get("description") != MARKER or resource.get("disabled"):
        raise SetupError(
            f"Existing {kind} is not an active SNR NEST-managed resource. Review it first."
        )


def setup(config, cloud):
    project = cloud("projects", "describe", config.project)
    number = str(project.get("projectNumber", ""))
    if project.get("projectId") != config.project or not re.fullmatch(r"\d{6,20}", number):
        raise SetupError("Google did not confirm the requested project and project number.")
    if project.get("lifecycleState") != "ACTIVE":
        raise SetupError("The selected Google project is not active.")
    billing = cloud("billing", "projects", "describe", config.project)
    if billing.get("billingEnabled") is not True:
        raise SetupError(f"Billing is not enabled for {config.project}. Link billing, then rerun.")

    # All preflight reads succeed before any API, resource or IAM change.
    cloud("services", "enable", *APIS)
    accounts = cloud("iam", "service-accounts", "list") or []
    emails = {}
    for purpose in ("deployer", "builder", "runtime"):
        account_id = f"snr-nest-{purpose}"
        email = f"{account_id}@{config.project}.iam.gserviceaccount.com"
        existing = next((item for item in accounts if item.get("email") == email), None)
        if existing:
            require_managed(existing, f"{purpose} service account")
        else:
            cloud(
                "iam",
                "service-accounts",
                "create",
                account_id,
                f"--display-name=SNR NEST {purpose}",
                f"--description={MARKER}",
            )
        emails[purpose] = email

    repository = named(
        cloud("artifacts", "repositories", "list", f"--location={config.region}"), "snr-nest"
    )
    if repository and repository.get("format") != "DOCKER":
        raise SetupError("Existing snr-nest Artifact Registry repository is not Docker format.")
    if not repository:
        cloud(
            "artifacts",
            "repositories",
            "create",
            "snr-nest",
            "--repository-format=docker",
            f"--location={config.region}",
            f"--description={MARKER}",
        )

    bucket_name = f"snr-nest-build-{number}-{config.region}"
    buckets = cloud("storage", "buckets", "list") or []
    bucket = next((item for item in buckets if item.get("name") == bucket_name), None)
    if bucket:
        iam = bucket.get("iamConfiguration", {})
        uniform = bucket.get(
            "uniform_bucket_level_access", iam.get("uniformBucketLevelAccess", {}).get("enabled")
        )
        if isinstance(uniform, dict):
            uniform = uniform.get("enabled")
        private = bucket.get("public_access_prevention", iam.get("publicAccessPrevention"))
        if (
            uniform is not True
            or private != "enforced"
            or bucket.get("location", "").lower() != config.region
        ):
            raise SetupError("The existing source bucket has different privacy/location settings.")
    else:
        cloud(
            "storage",
            "buckets",
            "create",
            f"gs://{bucket_name}",
            f"--location={config.region}",
            "--uniform-bucket-level-access",
            "--public-access-prevention",
        )

    pool_id = "snr-nest-github"
    pool = named(cloud("iam", "workload-identity-pools", "list", "--location=global"), pool_id)
    if pool:
        require_managed(pool, "workload identity pool")
        if pool.get("state") != "ACTIVE":
            raise SetupError("The existing workload identity pool is not active.")
    else:
        cloud(
            "iam",
            "workload-identity-pools",
            "create",
            pool_id,
            "--location=global",
            "--display-name=SNR NEST GitHub",
            f"--description={MARKER}",
        )
    providers = (
        cloud(
            "iam",
            "workload-identity-pools",
            "providers",
            "list",
            "--location=global",
            f"--workload-identity-pool={pool_id}",
        )
        or []
    )
    if any(item.get("name", "").split("/")[-1] != "github" for item in providers):
        raise SetupError("The dedicated GitHub pool contains other providers. Review it first.")
    provider = named(providers, "github")
    if provider:
        if (
            provider.get("disabled")
            or provider.get("state") != "ACTIVE"
            or provider.get("oidc", {}).get("issuerUri")
            != "https://token.actions.githubusercontent.com"
            or provider.get("attributeMapping") != MAPPING
            or provider.get("attributeCondition") != config.condition
        ):
            raise SetupError("Existing GitHub provider has different trust rules. Review it first.")
    else:
        cloud(
            "iam",
            "workload-identity-pools",
            "providers",
            "create-oidc",
            "github",
            "--location=global",
            f"--workload-identity-pool={pool_id}",
            "--issuer-uri=https://token.actions.githubusercontent.com",
            "--attribute-mapping=" + ",".join(f"{key}={value}" for key, value in MAPPING.items()),
            f"--attribute-condition={config.condition}",
        )

    deployer = f"serviceAccount:{emails['deployer']}"
    builder = f"serviceAccount:{emails['builder']}"
    for role in (
        "roles/run.admin",
        "roles/cloudbuild.builds.editor",
        "roles/serviceusage.serviceUsageConsumer",
    ):
        cloud(
            "projects",
            "add-iam-policy-binding",
            config.project,
            f"--member={deployer}",
            f"--role={role}",
            "--condition=None",
        )
    cloud(
        "projects",
        "add-iam-policy-binding",
        config.project,
        f"--member={builder}",
        "--role=roles/logging.logWriter",
        "--condition=None",
    )
    for member, role in (
        (deployer, "roles/artifactregistry.reader"),
        (builder, "roles/artifactregistry.writer"),
    ):
        cloud(
            "artifacts",
            "repositories",
            "add-iam-policy-binding",
            "snr-nest",
            f"--location={config.region}",
            f"--member={member}",
            f"--role={role}",
        )
    # Storage Admin is scoped to the dedicated source bucket, never the project.
    # The runtime receives no project-level role and cannot read this bucket.
    for member, role in (
        (deployer, "roles/storage.admin"),
        (builder, "roles/storage.objectViewer"),
    ):
        cloud(
            "storage",
            "buckets",
            "add-iam-policy-binding",
            f"gs://{bucket_name}",
            f"--member={member}",
            f"--role={role}",
        )
    for purpose in ("builder", "runtime"):
        cloud(
            "iam",
            "service-accounts",
            "add-iam-policy-binding",
            emails[purpose],
            f"--member={deployer}",
            "--role=roles/iam.serviceAccountUser",
            "--condition=None",
        )
    principal = f"principalSet://iam.googleapis.com/projects/{number}/locations/global/workloadIdentityPools/{pool_id}/attribute.repository/{config.repository}"
    cloud(
        "iam",
        "service-accounts",
        "add-iam-policy-binding",
        emails["deployer"],
        f"--member={principal}",
        "--role=roles/iam.workloadIdentityUser",
        "--condition=None",
    )
    return {
        "GCP_PROJECT_ID": config.project,
        "GCP_REGION": config.region,
        "GCP_ARTIFACT_REPOSITORY": "snr-nest",
        "GCP_SERVICE": "snr-nest-api",
        "GCP_BUILD_SOURCE_BUCKET": f"gs://{bucket_name}",
        "GCP_DEPLOY_SERVICE_ACCOUNT": emails["deployer"],
        "GCP_BUILD_SERVICE_ACCOUNT": emails["builder"],
        "GCP_RUNTIME_SERVICE_ACCOUNT": emails["runtime"],
        "GCP_WORKLOAD_IDENTITY_PROVIDER": (
            f"projects/{number}/locations/global/workloadIdentityPools/{pool_id}/providers/github"
        ),
        "PUBLIC_SITE_URL": config.site_url,
    }


def write_variables(path, variables):
    content = "".join(f"{key}={value}\n" for key, value in variables.items())
    path = Path(path)
    if path.is_symlink():
        raise SetupError("Choose a regular output file, not a symlink.")
    if path.exists():
        if path.read_text() != content:
            raise SetupError(
                "Output file already has different contents. Choose another --output path."
            )
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x") as file:
        file.write(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--site-url", required=True)
    parser.add_argument("--region", default="asia-south1")
    parser.add_argument("--repository", default="Marykamalaperli/SNR_website")
    parser.add_argument("--output", default=".local/gcp-github-variables.env")
    parser.add_argument(
        "--plan", action="store_true", help="Print scope without calling Google Cloud"
    )
    args = parser.parse_args()
    try:
        config = SetupConfig(args.project, args.site_url, args.region, args.repository)
        if args.plan:
            print(
                json.dumps(
                    {
                        "project": config.project,
                        "region": config.region,
                        "frontend_origin": config.site_url,
                        "repository": config.repository,
                        "github_trust_condition": config.condition,
                        "service_accounts": [
                            "snr-nest-deployer",
                            "snr-nest-builder",
                            "snr-nest-runtime",
                        ],
                        "artifact_repository": "snr-nest",
                        "billing_check_required": True,
                        "creates_private_keys": False,
                    },
                    indent=2,
                )
            )
            return
        variables = setup(config, Gcloud(config.project))
        write_variables(args.output, variables)
        print(f"Setup completed. Public GitHub variable metadata saved to {args.output}.")
        print("\n".join(f"{key}={value}" for key, value in variables.items()))
        print(
            "No private key was created. Set these GitHub Actions variables, then run target=both."
        )
    except (SetupError, ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f"Setup stopped: {error}\n")


if __name__ == "__main__":
    main()
