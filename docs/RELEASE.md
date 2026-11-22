# Release the target application

No target AWS release is currently operational. A release requires explicit owner
authorization after the target architecture and infrastructure are implemented.

## Release prerequisites

- all required format, lint, unit, integration, migration and browser checks pass;
- critical authorization and object-access negative tests pass;
- payroll decisions are approved or every payroll output remains draft only;
- private S3 access, CloudFront OAC, exact CORS and production headers are verified;
- backup and restore evidence exists;
- migration, rollback, retention, incident ownership and known limitations are
  reviewed;
- the owner approves the exact frontend version, API image digest and migration set.

## Planned workflow

GitHub Actions uses AWS OIDC and a least-privilege role. It builds and tests, syncs
hashed frontend assets to the private bucket, invalidates only mutable entry files,
publishes an immutable API image and records deployment metadata. Long-lived AWS
keys are prohibited.

## Post-release verification

- CloudFront serves `/` and approved SPA routes over HTTPS.
- Direct S3 frontend and evidence reads are denied.
- API health/readiness and exact allowed-origin requests succeed.
- Unknown origins and hosts fail.
- Employee, Store Admin and HR/Payroll journeys work with production-like data.
- Cross-store and object-ID attacks fail.
- Payslips remain private and signed URLs expire.
- Monitoring receives health, backup and security signals.

## Rollback

Roll back the frontend version and API image independently where schema compatibility
permits. Restore data only through the approved recovery procedure. Never reverse a
live migration or delete attendance/payroll history without a reviewed migration,
backup and reconciliation plan.
