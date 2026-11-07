# Decisions and approval register

| Decision                                               | Status                                   | Rationale                                                       |
| ------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------- |
| React + JavaScript/JSX + Vite; Python/FastAPI          | Confirmed by brief                       | Small maintainable team stack; no TypeScript                    |
| Orange-led five-color identity                         | Confirmed by brief                       | Warm, people-focused product                                    |
| Cloudflare Pages → Cloud Run → Supabase                | Frontend reported live; API/data pending | Separate static, API and data boundaries                        |
| Server-confirmed roles and tenant scope                | Confirmed                                | Browser state cannot grant access                               |
| Employee, Supervisor, HR interfaces                    | Initial frontend                         | Auditor and owner interfaces deferred; privileges stay distinct |
| Supervisor recommends; HR decides                      | Confirmed                                | No supervisor final approval                                    |
| Dev-only, visibly labeled synthetic previews           | Implemented                              | Review UI without fabricating authentication                    |
| Session membership adapter fails closed                | Implemented                              | No approved database integration or credentials yet             |
| Attendance is append-only, server-timed and idempotent | Required future contract                 | Preserve original evidence                                      |
| Browser writes denied in initial RLS migration         | Draft security baseline                  | Mutations require audited transactional APIs                    |
| No location or selfie collection in foundation         | Confirmed                                | Consent/retention not approved; no facial recognition           |
| Self-host fonts; no external analytics                 | Implemented                              | Avoid runtime third-party requests                              |
| No PWA, payroll or leave calculations                  | Deferred                                 | Not part of approved MVP foundation                             |
| License                                                | Pending owner approval                   | No LICENSE file created                                         |

## Decisions required before private-data integration

- Actual production domain, Supabase project, approved redirect URLs and CORS origins.
- Membership provisioning, multi-organization selection, team/site scope and revocation.
- Shift time zones, overnight shifts, grace periods, clock-in site verification,
  multiple punches, correction deadlines and self-approval/conflict rules.
- HR document categories, retention/deletion, export permissions and audit review.
- Consent and privacy policy before collecting location or evidence; storage scanning.
- Auditor and system-owner capability definitions and separate interfaces.
- Backup/restore objectives, incident owners, monitoring and rate-limit infrastructure.

SQL files are reviewable migrations; no live changes run automatically. The owner
applies reviewed migrations in the selected Supabase project.

## Deployment selections supplied by the owner

- Public frontend URL: `https://snr-nest.pages.dev` (reported live by the owner;
  this environment's network policy prevents independent verification).
- Google Cloud Project ID: `snr-nest`.
- Proposed backend region: `asia-south1` (Mumbai), matching the documented default.
- Billing status and Google project/IAM access are not verified. The Cloud Shell
  setup script checks billing before any provisioning. Backend deployment and
  Supabase integration remain pending.

## Supabase authentication while Google Cloud is paused

The owner explicitly paused Google Cloud setup and requested Supabase connection
and authentication. Selected project: `https://emvppphhkmbpgqduikup.supabase.co`.
Only the public publishable key was supplied; no service-role or database password
is needed. The public values are stored in ignored local configuration and must
also be configured as GitHub Actions frontend variables for deployment.

The default authentication path now uses Supabase Auth identity verification and
the read-only `current_workspace()` database RPC under RLS. Supabase's servers enforce
the assignment; no role is taken from user metadata or browser state. This removes
the Cloud Run hosting dependency for authentication while preserving FastAPI for
business APIs and optional `api` session verification with the same RPC.

Confirmed accounts need an explicit project-owner assignment. Public sign-ups should
be disabled; no first-user promotion exists. Multiple active organizations are denied
until a deliberate selection model is implemented. Session storage is tab-scoped;
restore and refresh recheck membership, and logout clears local tokens. Live project
activation/verification still needs migrations, an assigned account and a frontend
release. Attendance/corrections/documents remain outside this authentication change.

## Workforce setup while Google Cloud remains paused

The owner confirmed working sign-in and requested the next design/development
slice. Organization setup and employee profiles use narrow Supabase PostgreSQL
functions, keeping the release independent of Cloud Run and elevated browser keys.
Production now includes an HR dashboard/directory/setup page, own employee profile
and assigned supervisor roster. Preview components remain separate.

Fixed-search-path definer functions authorize a single active membership on every
call. HR can configure sites/departments/shift templates and explicitly onboard
confirmed Auth accounts as Employee or Supervisor. Their one department/site scope
is part of that saved assignment. HR/auditor/owner provisioning, protected accounts,
multi-organization accounts and existing multi-assignment supervisor edits remain
outside these forms. No Auth administrative key or Edge Function is required for
this slice: account creation/passwords stay in the Supabase dashboard.

All saves append audit events atomically. Record and membership versions prevent
stale overwrites, including external access changes. Inactive profile access is
explicitly disabled in membership; data requests recheck it. Staff projections
enforce self/team/HR scope and expose account email only to HR. Direct table writes
remain denied. Attendance, corrections and private files need separate designs.

## Dashboard-only day-to-day administration

The owner explicitly requested that person/data creation and edits happen in the
admin dashboard, removing the prerequisite to create each Auth user in Supabase.
A small JavaScript Pages Functions hosting adapter now invokes GoTrue Admin APIs
for scoped staff creation/linking and credentials. This is a narrow exception for
the existing hosting runtime; Python/FastAPI remains the business API stack. No
new hosting provider or Google billing is needed. It uses a runtime-only encrypted
binding, not an elevated browser key. A one-time migration/binding/deployment is
required; routine staff operations stay in the app.

The account/profile boundary uses private intents, server-only Auth operation
markers, keyed fingerprints, held snapshots/relationships and dashboard recovery.
Credentials are never persisted in the application ledger, rolled back blindly,
or replayed after completed request IDs. Protected roles and tenant boundaries
remain enforced. Existing-account onboarding includes confirmation in the server
flow; workspace/own settings are implemented rather than redirecting to a provider
console. Own email changes retain the Auth provider's verification policy.
