"""Provisioning guardrails with a fake CLI; these are NOT live Google IAM tests."""

import importlib.util
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

script = Path(__file__).resolve().parents[2] / "scripts" / "bootstrap_gcp.py"
spec = importlib.util.spec_from_file_location("snr_bootstrap_gcp", script)
bootstrap = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bootstrap
spec.loader.exec_module(bootstrap)
POOL_PATH = "projects/123456789012/locations/global/workloadIdentityPools/snr-nest-github"


class FakeCloud:
    def __init__(self):
        self.calls = []
        self.billing = True
        self.accounts = []
        self.repositories = []
        self.buckets = []
        self.pools = []
        self.providers = []

    def __call__(self, *args):
        self.calls.append(args)
        if args[:2] == ("projects", "describe"):
            return {
                "projectId": "snr-nest",
                "projectNumber": "123456789012",
                "lifecycleState": "ACTIVE",
            }
        if args[:3] == ("billing", "projects", "describe"):
            return {"billingEnabled": self.billing}
        reads = {
            ("iam", "service-accounts", "list"): self.accounts,
            ("artifacts", "repositories", "list"): self.repositories,
            ("storage", "buckets", "list"): self.buckets,
            ("iam", "workload-identity-pools", "list"): self.pools,
        }
        if args[:3] in reads:
            return deepcopy(reads[args[:3]])
        if args[:4] == ("iam", "workload-identity-pools", "providers", "list"):
            return deepcopy(self.providers)
        if args[:3] == ("iam", "service-accounts", "create"):
            self.accounts.append(
                {
                    "email": f"{args[3]}@snr-nest.iam.gserviceaccount.com",
                    "description": bootstrap.MARKER,
                }
            )
        if args[:3] == ("artifacts", "repositories", "create"):
            self.repositories.append(
                {
                    "name": "projects/snr-nest/locations/asia-south1/repositories/snr-nest",
                    "format": "DOCKER",
                }
            )
        if args[:3] == ("storage", "buckets", "create"):
            self.buckets.append(
                {
                    "name": args[3].removeprefix("gs://"),
                    "location": "ASIA-SOUTH1",
                    "uniform_bucket_level_access": True,
                    "public_access_prevention": "enforced",
                }
            )
        if args[:3] == ("iam", "workload-identity-pools", "create"):
            self.pools.append(
                {
                    "name": POOL_PATH,
                    "description": bootstrap.MARKER,
                    "state": "ACTIVE",
                }
            )
        if args[:4] == ("iam", "workload-identity-pools", "providers", "create-oidc"):
            self.providers.append(
                {
                    "name": f"{POOL_PATH}/providers/github",
                    "state": "ACTIVE",
                    "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"},
                    "attributeMapping": bootstrap.MAPPING,
                    "attributeCondition": config().condition,
                }
            )
        return {}


def config(**kwargs):
    return bootstrap.SetupConfig(
        project="snr-nest", site_url="https://snr-nest.pages.dev", **kwargs
    )


def grants(cloud):
    return [call for call in cloud.calls if "add-iam-policy-binding" in call]


def test_billing_is_checked_before_any_mutation():
    cloud = FakeCloud()
    cloud.billing = False
    with pytest.raises(bootstrap.SetupError, match="Billing is not enabled"):
        bootstrap.setup(config(), cloud)
    assert cloud.calls == [
        ("projects", "describe", "snr-nest"),
        ("billing", "projects", "describe", "snr-nest"),
    ]


def test_setup_is_repeatable_and_scopes_privileges_without_private_keys():
    cloud = FakeCloud()
    first = bootstrap.setup(config(), cloud)
    assert first["GCP_PROJECT_ID"] == "snr-nest"
    assert first["PUBLIC_SITE_URL"] == "https://snr-nest.pages.dev"
    assert first["GCP_BUILD_SOURCE_BUCKET"] == "gs://snr-nest-build-123456789012-asia-south1"
    assert first["GCP_WORKLOAD_IDENTITY_PROVIDER"].endswith("/snr-nest-github/providers/github")
    assert cloud.providers[0]["attributeCondition"] == config().condition
    assert "refs/heads/main" in config().condition
    assert not any("keys" in call for call in cloud.calls)
    assert not any(
        "roles/owner" in part or "roles/editor" in part for call in cloud.calls for part in call
    )
    project_grants = [
        call for call in grants(cloud) if call[:2] == ("projects", "add-iam-policy-binding")
    ]
    assert not any("snr-nest-runtime" in part for call in project_grants for part in call)
    assert not any("roles/storage.admin" in part for call in project_grants for part in call)
    cloud.calls.clear()
    assert bootstrap.setup(config(), cloud) == first
    assert not any("create" in call or "create-oidc" in call for call in cloud.calls)


def test_unrelated_existing_identity_is_never_repurposed():
    cloud = FakeCloud()
    cloud.accounts.append(
        {
            "email": "snr-nest-deployer@snr-nest.iam.gserviceaccount.com",
            "description": "Another application",
        }
    )
    with pytest.raises(bootstrap.SetupError, match="not an active SNR NEST-managed"):
        bootstrap.setup(config(), cloud)
    assert not grants(cloud)


def test_an_existing_provider_with_different_trust_is_not_overwritten():
    cloud = FakeCloud()
    bootstrap.setup(config(), cloud)
    cloud.calls.clear()
    cloud.providers[0]["attributeCondition"] = "true"
    with pytest.raises(bootstrap.SetupError, match="different trust rules"):
        bootstrap.setup(config(), cloud)
    assert not grants(cloud)
    assert not any("update" in call or "delete" in call for call in cloud.calls)


def test_a_pool_cannot_share_trust_with_another_provider():
    cloud = FakeCloud()
    bootstrap.setup(config(), cloud)
    cloud.calls.clear()
    cloud.providers.append({"name": f"{POOL_PATH}/providers/another-provider"})
    with pytest.raises(bootstrap.SetupError, match="contains other providers"):
        bootstrap.setup(config(), cloud)
    assert not grants(cloud)


def test_public_or_other_region_source_buckets_are_not_reused():
    for updates in [
        {"public_access_prevention": "inherited"},
        {"location": "US"},
        {"uniform_bucket_level_access": {"enabled": False}},
    ]:
        cloud = FakeCloud()
        bootstrap.setup(config(), cloud)
        cloud.calls.clear()
        cloud.buckets[0].update(updates)
        with pytest.raises(bootstrap.SetupError, match="different privacy/location settings"):
            bootstrap.setup(config(), cloud)
        assert not grants(cloud)


@pytest.mark.parametrize(
    "changes",
    [
        {"project": "wrong project"},
        {"repository": "owner/repo';evil"},
        {"site_url": "http://example.org"},
        {"site_url": "https://example.org/path"},
        {"region": "--another-project"},
    ],
)
def test_invalid_inputs_are_rejected_before_any_cloud_access(changes):
    arguments = {"project": "snr-nest", "site_url": "https://snr-nest.pages.dev", **changes}
    with pytest.raises(bootstrap.SetupError):
        bootstrap.SetupConfig(**arguments)


def test_output_contains_only_variable_metadata_and_preserves_existing_files(tmp_path):
    variables = bootstrap.setup(config(), FakeCloud())
    output = tmp_path / "variables.env"
    bootstrap.write_variables(output, variables)
    assert output.read_text().startswith("GCP_PROJECT_ID=snr-nest\n")
    assert all("TOKEN" not in key and "PRIVATE" not in key for key in variables)
    bootstrap.write_variables(output, variables)
    output.write_text("User-created file")
    with pytest.raises(bootstrap.SetupError, match="different contents"):
        bootstrap.write_variables(output, variables)
    assert output.read_text() == "User-created file"


def test_gcloud_always_targets_the_selected_project(monkeypatch):
    commands = []

    def run(command, **kwargs):
        commands.append(command)
        assert kwargs["check"] is True
        return SimpleNamespace(stdout="{}")

    monkeypatch.setattr(bootstrap.subprocess, "run", run)
    bootstrap.Gcloud("snr-nest")("services", "enable", "run.googleapis.com")
    assert "--project=snr-nest" in commands[0]
    assert "--quiet" in commands[0]
