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

The SQL files are reviewable drafts; no live database changes are authorized or run.

## Deployment selections supplied by the owner

- Public frontend URL: `https://snr-nest.pages.dev` (reported live by the owner;
  this environment's network policy prevents independent verification).
- Google Cloud Project ID: `snr-nest`.
- Proposed backend region: `asia-south1` (Mumbai), matching the documented default.
- Billing status and Google project/IAM access are not verified. The Cloud Shell
  setup script checks billing before any provisioning. Backend deployment and
  Supabase integration remain pending.
