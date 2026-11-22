# Security and permission boundaries

The browser is untrusted. FastAPI must verify identity, active account status,
organization, exact role, store scope, resource ownership and workflow state on
every private request. UI routing and hidden controls improve usability but do not
authorize data.

## Permission matrix

| Capability              | Employee          | Store Admin                      | HR/Payroll                              | System Admin              | Auditor                 |
| ----------------------- | ----------------- | -------------------------------- | --------------------------------------- | ------------------------- | ----------------------- |
| Own attendance          | Read and submit   | Assigned-store review            | Approved organization                   | No implicit access        | Authorized read-only    |
| Employees and shifts    | Own assignment    | Assigned store                   | Approved organization                   | Configure scope           | Authorized read-only    |
| Store QR                | Scan              | Create or refresh assigned store | Oversight                               | Configure policy          | Read evidence only      |
| Correction request      | Own               | Propose/review in assigned store | Final decision                          | No silent edit            | Read-only               |
| Payroll configuration   | No                | No                               | Approved organization                   | Security/config only      | Read-only if authorized |
| Prepare/approve payroll | No                | No                               | Explicit authority and separation rules | No silent edit            | Read-only               |
| Payslip                 | Own released file | No                               | Authorized release                      | No implicit access        | Authorized read-only    |
| Role assignment         | No                | No                               | Limited approved staff operations       | Explicit system authority | No                      |

No role self-assigns or gains another role by inheritance. Maker/approver separation,
self-approval conflicts and delegated authority must be explicitly modeled.

## Authentication and sessions

- Password hashes use Argon2id or bcrypt and never leave the server.
- Use short-lived sessions with secure refresh rotation and revocation.
- If cookies are selected, require `HttpOnly`, `Secure`, appropriate `SameSite` and
  CSRF protection. If bearer tokens are selected, document secure storage and XSS
  controls before implementation.
- Login errors are generic and rate limited. Deactivated users cannot create new
  sessions or submit attendance.
- Secrets remain outside source, images, logs and frontend build variables.

## Tenant and store isolation

Every scoped entity carries the required organization and store keys. Services and
repositories apply those constraints to reads and writes. Integration tests must
prove that object-ID guessing, query manipulation and cross-store role use return
401/403/404 without disclosing another tenant's existence.

## Attendance controls

- Store QR challenges contain a random nonce, store ID, issue time and expiry and
  are server signed. Expired, altered, wrong-store and replayed challenges fail.
- Event time is the server receipt time. Client time is diagnostic metadata only.
- An idempotency key prevents duplicate punches. State checks reject check-out before
  check-in and invalid duplicate transitions.
- Photo uploads use constrained presigned operations and opaque keys. The backend
  verifies object ownership, purpose, content type, size and status before use.
- Raw attendance events never change. Corrections create append-only before/after
  evidence and audit records.
- No facial recognition, biometric templates or automated liveness are included.

## Payroll controls

- Payroll reads only approved/locked attendance and effective-dated configuration.
- Money uses `Decimal` and database `NUMERIC`; floating point is prohibited.
- Input snapshots, rule versions, currency and a deterministic hash are stored.
- Unresolved attendance or required configuration blocks approval by default.
- Approval locks the run transactionally. A locked run is immutable; corrections
  use reversal or a new version.
- Only explicit HR/Payroll authority may approve or release. Every sensitive action
  is audited.

## Object storage

- S3 Block Public Access remains enabled on all buckets.
- CloudFront reads the frontend bucket only through the named OAC distribution.
- Evidence, payslips and backups use separate private buckets or strictly isolated
  policies and never share public cache behavior.
- Signed URLs are short lived, created only after authorization and never logged.
- Abandoned or unverified uploads are cleaned up under an approved lifecycle.
- Uploads remain untrusted until validation, re-encoding or scanning policy passes.

## Infrastructure

- TLS is required everywhere. CORS allows exact frontend origins only.
- PostgreSQL binds to the private Docker network and is not publicly reachable.
- Administrative SSH is restricted to approved IPs or a managed tunnel.
- GitHub Actions uses OIDC and least-privilege AWS roles, not long-lived keys.
- Backups are encrypted and stored off-server. A restore test is a release gate.
- Logs exclude passwords, tokens, signed URLs, payroll detail, photos and request
  bodies. Use sanitized request IDs and route templates.

## Privacy and compliance

Approve notice, consent or other lawful basis, access, retention, deletion and
employee dispute procedures before live photo, location or payroll processing.
Automated tests do not certify legal compliance, accessibility or fraud prevention.
Obtain qualified review for jurisdiction-specific payroll and privacy rules.
