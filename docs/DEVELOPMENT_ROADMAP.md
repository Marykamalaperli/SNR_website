# Development roadmap

1. **Foundation (this repository):** architecture and design system, public site, auth
   boundary, three synthetic preview workspaces, health API, draft RLS, CI/deployment
   preparation and meaningful local validation.
2. **Identity and tenancy:** approve policies; configure a Supabase test project;
   test migrations and RLS with multiple tenants; implement trusted memberships and
   role revocation; connect a scoped employee read API. Complete this before private use.
3. **Attendance:** implement transactional state transitions, server timestamps,
   idempotency, overnight shifts, site/shift checks and auditable event history.
4. **Corrections:** persist employee requests, supervisor recommendations and HR
   decisions with concurrency and conflict-of-interest protections.
5. **Documents/reports:** approve privacy/retention, private buckets, scanning,
   signed URLs, scoped exports and audit review.
6. **Production:** choose canonical domain, test deployment/rollback, backups,
   monitoring, abuse controls, accessibility and independent security review; obtain
   explicit deployment authorization. Auditor/owner UIs remain separate future work.
