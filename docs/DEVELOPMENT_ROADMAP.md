# Development roadmap

The latest release makes routine staff/account and workspace edits available in
the admin dashboard. Activate its one-time server binding and migration using
`ADMIN_DASHBOARD_SETUP.md`, then verify a real test employee login before attendance.

1. **Foundation (this repository):** architecture and design system, public site, auth
   boundary, three synthetic preview workspaces, health API, draft RLS, CI/deployment
   preparation and meaningful local validation.
2. **Identity and tenancy:** authentication is confirmed live by the owner. The
   organization/directory release implements HR saves and self/team profiles,
   with multi-tenant SQL tests and atomic audit/version checks. Apply its migration,
   deploy the frontend and verify live scopes using `WORKFORCE_SETUP.md`.
3. **Attendance:** implement transactional state transitions, server timestamps,
   idempotency, overnight shifts, site/shift checks and auditable event history.
4. **Corrections:** persist employee requests, supervisor recommendations and HR
   decisions with concurrency and conflict-of-interest protections.
5. **Documents/reports:** approve privacy/retention, private buckets, scanning,
   signed URLs, scoped exports and audit review.
6. **Production:** choose canonical domain, test deployment/rollback, backups,
   monitoring, abuse controls, accessibility and independent security review; obtain
   explicit deployment authorization. Auditor/owner UIs remain separate future work.
