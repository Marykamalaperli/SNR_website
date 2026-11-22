# SNR NEST implementation progress

Last verified: 22 November 2026

This is the shared handoff ledger for Codex, Antigravity and human contributors.
It records repository and cloud evidence; it does not replace the five-document
source pack or grant permission to deploy, provision, migrate data or change DNS.

## Status vocabulary

- **Planned:** described in source or active documentation but not implemented.
- **Implemented:** present in the repository and locally reviewed.
- **Validated:** the named automated or manual checks completed successfully.
- **Merged:** incorporated into `elite/main` through the linked pull request.
- **Provisioned:** observed in the named AWS account and Region. Repository code or
  a successful CloudFormation review is not provisioned infrastructure.

## Completed foundation

| Area | Status | Evidence |
| --- | --- | --- |
| Source alignment and transition plan | Merged | PR [#1](https://github.com/elite-horizon/SNR_website/pull/1), commit `d0774a7`; active architecture, security, decisions, reuse inventory and validation documents |
| Target local foundation | Merged and validated | React/TypeScript, FastAPI, PostgreSQL, SQLAlchemy/Alembic and Docker Compose baseline; repository CI and Work Package 1 validation |
| Secure AWS delivery identity | Merged and provisioned | PR [#2](https://github.com/elite-horizon/SNR_website/pull/2), commit `4c246ba`; GitHub OIDC roles observed in account `376793939540` |
| AWS staging edge/storage definition | Merged and validated, not provisioned | PR [#3](https://github.com/elite-horizon/SNR_website/pull/3), commit `4f578d3`; CloudFormation validation and no-execute change-set review completed |
| Codex/Antigravity repository handoff | Implemented | Root `AGENTS.md`, `.agents/` rules and skills, and this ledger; merge evidence is in Git history |

## AWS staging boundary

Observed and usable:

- AWS account `376793939540`, workload Region `ap-south-1` and local profile
  `snrnest-aws`.
- GitHub OIDC federation with `snrnest-staging-github-deploy` and
  `snrnest-staging-cloudformation-service` roles.
- GitHub staging environment variables and a successful live OIDC validation
  workflow.

Implemented as infrastructure code but **not provisioned**:

- Four private S3 buckets for frontend, evidence, payslips and backups.
- CloudFront distribution and origin access control for the private frontend.
- Associated bucket policies, logging, retention and cost-control settings.

Existing Lightsail, legacy S3, hosted-zone and certificate resources pre-date this
plan and remain out of scope. Do not describe them as the target staging stack.

## Current work and next package

The repository handoff package is the current documentation change. It adds a
single progress record and makes reading and updating it part of both agent
workflows. It changes no product behavior and no AWS resources.

The next product work package is **identity, roles and tenant/store isolation**.
Its boundary is:

- organization, store, user, employee and role-assignment persistence;
- secure session authentication and user deactivation;
- server-side organization/store authorization;
- negative tests proving cross-tenant and cross-store access is denied; and
- migrations plus API contracts, without attendance or payroll feature scope.

Do not start attendance, payroll or live deployment work inside that package.

## Open decisions and gates

- Authentication/session mechanism and recovery policy require a recorded design
  decision before Work Package 2 implementation.
- Staging hostnames, certificate and DNS changes require explicit approval.
- Provisioning the reviewed AWS foundation requires explicit approval and a cost
  review; no-execute validation is not approval.
- Compute choice and whether to create a new target instance remain open. The
  legacy `snrnest-prod` Lightsail instance must not be silently reused.
- Retention, RPO/RTO and remaining product decisions in `docs/DECISIONS.md` remain
  unresolved where marked open.
- Payroll remains **Draft - Not for payment** until SRS P-01 through P-10 are
  qualified and approved.

## Required handoff update

At the end of every work package, update this file in the same pull request with:

1. the resulting status using the vocabulary above;
2. branch, PR and commit evidence when available;
3. exact checks run, their outcomes and any skipped checks;
4. external resources actually changed or provisioned; and
5. the next bounded package plus unresolved decisions.

Never record planned behavior as operational, and never include credentials,
tokens, signed URLs, personal data or private request content.
