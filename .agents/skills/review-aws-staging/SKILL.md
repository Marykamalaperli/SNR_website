---
name: review-aws-staging
description: Design, validate, review, or update SNR NEST AWS staging infrastructure using CloudFormation, GitHub OIDC, cost controls, and explicit provisioning gates.
---

# Review SNR NEST AWS staging

Use AWS account `376793939540`, workload region `ap-south-1`, local profile
`snrnest-aws` and GitHub OIDC. Verify the caller identity before every AWS mutation.
Never use or create long-lived GitHub AWS keys.

## Required context

Read `AGENTS.md`, `docs/AWS_STAGING_PLAN.md`, `infra/aws/README.md`,
`docs/PROGRESS.md`, `infra/aws/foundation.template.json` and every IAM policy
affected by the task. Inventory matching AWS resources before selecting names or
proposing imports. Treat the existing `snrnest-prod` Lightsail instance, legacy SNR
buckets, hosted zone and certificate requests as out of scope unless the user
explicitly authorizes them.

## Review sequence

1. Validate JSON and run `node --test scripts/aws-infra.test.mjs`.
2. Run `aws cloudformation validate-template` with profile `snrnest-aws`.
3. Validate changed identity policies with IAM Access Analyzer and resolve every
   error before attachment.
4. Create a no-execute change set, inspect its status, resolved resources and
   replacements, then remove the empty review stack.
5. Present the exact resource and cost boundary. Execution requires explicit user
   authorization after the review; a planning document is not authorization.
6. After authorized execution, verify S3 Block Public Access, OAC-only frontend
   reads, HTTPS behavior, private buckets, stack outputs and unexpected resources.
7. Update `docs/PROGRESS.md` in the same PR. Record validation separately from
   provisioning and list only external resources actually changed. Never record
   credentials, tokens, signed URLs or personal data.

Do not change DNS, request certificates, provision compute, move private data or
run live migrations unless each action is explicitly in the approved task. Never
delete retained buckets or their contents as part of rollback automation.
