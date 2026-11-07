# Isolation validation before enabling data access

The foundation migration is not applied automatically. It enables RLS, grants only
authenticated SELECT, narrowly scopes profiles/events/requests, denies document
metadata by default, and denies direct browser table writes. No Storage bucket or public
Storage policy is created. Keep `snr_private` outside exposed PostgREST schemas.

In an isolated Supabase project, provision test Auth users and two organizations
using an administrative test fixture. Run requests under real user JWTs (never a
service role when testing RLS), then assert:

1. Anonymous access returns no private data; direct browser table writes fail.
2. Employees see only their own organization membership, profile and events.
3. Supervisors see only assigned department **and site**, never another team/org.
4. HR sees only memberships' authorized organization records, never audit logs by
   inheritance. HR site-level restriction requires an additional reviewed assignment
   model before narrower-scope HR is enabled.
5. Auditor reads scoped audit only; owner has no HR/auditor data privileges.
6. Revoking membership immediately removes reads. Spoofing JWT user metadata has no effect.
7. Cross-tenant foreign keys fail; duplicate idempotency keys/final decisions fail;
   updates/deletes of history fail even through ordinary server SQL.
8. No employee, supervisor or HR can read document metadata or Storage until a
   category-specific access workflow and private signed URLs are implemented.

This suite has **not been executed against Supabase**. Read grants intentionally do
not complete every UI query: self/team shift/site projections need scoped APIs or
reviewed extra policies. Database owners/service roles bypass RLS; a production
adapter must preserve scopes, restrict privileges and independently authorize each
request. Attendance ordering, active shift/site checks, actor role checks and atomic
auditing require transactional services; table constraints alone do not implement them.

Local PostgreSQL validation is now automated by `bash scripts/test-supabase.sh`.
It applies all migrations and tests actual RLS, role/tenant ownership, metadata
spoofing, active-assignment revocation, multi-organization denial, browser-write
denial and auditor/owner separation. Owner provisioning helpers are also exercised.
Auth user contexts are emulated locally; live Supabase Auth/PostgREST verification
still requires project setup. `current_workspace()` is SECURITY INVOKER, has no
identity/role arguments, and grants no administrative mutation capability.

The third migration adds checked-definer workforce functions: HR-only setup and
audited profile transactions plus scoped directory reads. `workforce.sql` exercises
confirmed-account checks, tenant/role tampering, protected accounts, version
conflicts, atomic rollback/audit, pagination/search, supervisor reassignment,
assigned-shift immutability and revoked/ambiguous access. Definer functions are
tested as actual authenticated callers, not database-owner queries. Private helper
execution and direct table writes remain denied. See `docs/WORKFORCE_SETUP.md`.
