# AWS staging bootstrap

The authorized staging account is `376793939540`; the workload region is
`ap-south-1` (Mumbai). Local administration uses the temporary-credential profile
`snrnest-aws`. Re-authenticate with `aws login --profile snrnest-aws --region
ap-south-1` when the session expires.

GitHub Actions uses the account's existing `token.actions.githubusercontent.com`
OIDC provider and the dedicated role
`arn:aws:iam::376793939540:role/snrnest-staging-github-deploy`. The trust policy in
`github-oidc-trust.json` uses GitHub's immutable organization and repository IDs and
allows only the `main` branch or the `staging` environment. The role intentionally
has no service permissions until the infrastructure definitions establish the exact
least-privilege deployment policy.

Repository variables, which are identifiers rather than secrets, are:

- `AWS_ACCOUNT_ID=376793939540`
- `AWS_REGION=ap-south-1`
- `AWS_ROLE_ARN=arn:aws:iam::376793939540:role/snrnest-staging-github-deploy`

Run the manual `Verify AWS OIDC identity` workflow before granting deployment
permissions. It can obtain temporary credentials and call STS only; it cannot
provision application resources.

Production application delivery is defined in
`.github/workflows/deploy-production-aws.yml`. After the `Application checks`
workflow succeeds for `main`, it detects frontend and API changes and requests the
protected `production` GitHub Environment. The same workflow supports an explicit
manual redeployment from `main`. It uploads frontend assets only to the named
private origin bucket and API bundles only to the named Elastic Beanstalk release
prefix, then verifies the public HTTPS endpoints. The production environment must
define `CLOUDFRONT_DISTRIBUTION_ID=E3M8PS2Q089C7Y`; the account, Region and role
variables remain repository variables.

The additional least-privilege permissions are recorded in
`iam/github-production-deploy-policy.json`. Applying that inline policy and the
`production` OIDC trust subject is a separate reviewed AWS mutation; merging the
workflow alone does not grant cloud access.

`foundation.template.json` defines the first reviewable staging slice: four private
S3 buckets and a CloudFront OAC distribution. Validate it locally with:

```powershell
aws cloudformation validate-template `
  --profile snrnest-aws `
  --region ap-south-1 `
  --template-body file://infra/aws/foundation.template.json
```

`production-pilot.template.json` is the separate server/database review slice. It
defines a dedicated VPC, Elastic Beanstalk SingleInstance Docker environment,
private Single-AZ RDS PostgreSQL, Secrets Manager credentials, monitoring and AWS
Budget alerts. Supply the alert address through the `AlertEmail` parameter; never
commit a personal address to the template or parameter files.

The production-pilot stack requires `CAPABILITY_IAM`. Its execution role and
no-execute change set must be reviewed separately before provisioning. DNS,
certificates, application versions and database migrations are not included.

The IAM documents under `iam/` separate GitHub's change-set authority from the
CloudFormation service role's resource-management authority. Do not broaden either
policy to administrator access. Template validation and a no-execute change set are
required before any stack execution.

## Existing account resources

The bootstrap audit found legacy `snrnest-home` deployment resources and S3 buckets.
They are not part of this staging environment and must not be modified or reused
without a separate migration decision. New infrastructure must use explicit staging
names and import or replace existing resources only through a reviewed plan.
