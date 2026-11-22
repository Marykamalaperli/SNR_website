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

`foundation.template.json` defines the first reviewable staging slice: four private
S3 buckets and a CloudFront OAC distribution. Validate it locally with:

```powershell
aws cloudformation validate-template `
  --profile snrnest-aws `
  --region ap-south-1 `
  --template-body file://infra/aws/foundation.template.json
```

The IAM documents under `iam/` separate GitHub's change-set authority from the
CloudFormation service role's resource-management authority. Do not broaden either
policy to administrator access. Template validation and a no-execute change set are
required before any stack execution.

## Existing account resources

The bootstrap audit found legacy `snrnest-home` deployment resources and S3 buckets.
They are not part of this staging environment and must not be modified or reused
without a separate migration decision. New infrastructure must use explicit staging
names and import or replace existing resources only through a reviewed plan.
