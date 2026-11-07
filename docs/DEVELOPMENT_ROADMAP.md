# Development roadmap

The owner confirmed working HR/Employee/Supervisor access. The latest release
adds normal attendance and dashboard-managed shift assignments. Activate migration
0005 and the frontend using `ATTENDANCE_SETUP.md`, then verify an actual test
workday across all three roles. Corrections and approvals are next.

1. **Foundation (this repository):** architecture and design system, public site, auth
   boundary, three synthetic preview workspaces, health API, draft RLS, CI/deployment
   preparation and meaningful local validation.
2. **Identity and tenancy:** authentication is confirmed live by the owner. The
   organization/directory release implements HR saves and self/team profiles,
   with multi-tenant SQL tests and atomic audit/version checks. Apply its migration,
   deploy the frontend and verify live scopes using `WORKFORCE_SETUP.md`.
3. **Attendance:** implemented transactional punches, server timestamps,
   keyed replay, overnight shifts, HR shift assignments, scope checks and auditable
   history. Live activation/acceptance is separate from local verification.
4. **Corrections:** persist employee requests, supervisor recommendations and HR
   decisions with concurrency and conflict-of-interest protections.
5. **Documents/reports:** approve privacy/retention, private buckets, scanning,
   signed URLs, scoped exports and audit review.
6. **Production:** choose canonical domain, test deployment/rollback, backups,
   monitoring, abuse controls, accessibility and independent security review; obtain
   explicit deployment authorization. Auditor/owner UIs remain separate future work.
