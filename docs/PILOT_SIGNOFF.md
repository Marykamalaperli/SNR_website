# SNR NEST Pilot Release Sign-Off Form

**Product:** SNR NEST Attendance & Payroll MVP  
**Version:** v0.1.0-pilot  
**Evaluation Date:** 23 November 2026

---

## 1. Acceptance Criteria Checklist

| Category | Requirement | Validation Evidence | Status |
|---|---|---|---|
| **Identity & Access** | 5 exact roles enforced server-side with Argon2id password hashing and opaque session tokens | `backend/tests/test_identity_integration.py`, `backend/tests/test_day10_hardening_uat.py` | **PASSED** |
| **Store QR Challenge** | Short-lived HMAC-SHA256 store challenge, anti-replay, single-use token invalidation | `backend/tests/test_attendance_integration.py`, `backend/tests/test_day10_hardening_uat.py` | **PASSED** |
| **Punch Verification** | Photo upload intent, verified photo key requirement, transactional in/out punch state validation, idempotency key enforcement | `backend/tests/test_attendance_integration.py`, `TargetPunchCard.tsx` Vitest | **PASSED** |
| **Attendance Days** | Daily shift aggregation, automatic exception flags (missing punch, late, early departure, overtime), optimistic concurrency locking | `backend/tests/test_attendance_days_integration.py`, `TargetAttendanceDays.tsx` Vitest | **PASSED** |
| **Deterministic Payroll** | `Decimal` arithmetic with `ROUND_HALF_UP`, canonical SHA-256 `input_hash`, attendance exception gate | `backend/tests/test_payroll_draft_integration.py`, `TargetPayrollRuns.tsx` Vitest | **PASSED** |
| **Compliance Watermark** | Mandatory `Draft - Not for payment` banner across all draft, approved, and released payroll artifacts | Verified in tests and UI components | **PASSED** |
| **Approval & Payslips** | Transactional approval lock, reversal/re-versioning flow, private S3 payslip generation, authorized download intents | `backend/tests/test_payroll_day7_integration.py`, `targetPayrollDay7.test.tsx` | **PASSED** |
| **Reports Engine** | CWE-1236 CSV injection sanitization, streaming attendance & payroll CSV exports | `backend/tests/test_reports_day8_integration.py`, `targetReportsDay8.test.tsx` | **PASSED** |
| **PWA Polish** | `manifest.webmanifest`, service worker caching static assets while strictly bypassing `/api/*` and private documents | `sw.js`, `manifest.webmanifest`, production build | **PASSED** |
| **Infrastructure & Security**| PostgreSQL unexposed to host (private Docker network), Caddy reverse proxy with HSTS, AES-256 backup automation, UFW firewall script, OIDC deployment workflow | `scripts/aws-infra.test.mjs`, `scripts/server-deploy.test.mjs` | **PASSED** |
| **Backup-Restore Drill** | Automated database backup generation, SHA-256 checksum integrity, restoration verification | `backend/tests/test_day10_backup_restore.py` | **PASSED** |

---

## 2. Release Recommendation

All 10 days of the Codex Implementation Plan are implemented and validated. The repository is hardened, covered by 44 backend integration tests, 25 frontend test suites (187 tests), and 12 infrastructure test assertions.

**Recommendation:** Approved for Pilot Release Tag `v0.1.0`.

