# SNR NEST Data Retention and Privacy Checklist

**Version:** 1.0  
**Effective Date:** 23 November 2026

---

## 1. Compliance Baseline & Guiding Principles

- **Append-Only Auditing:** Raw attendance punches (`attendance_events`), daily adjustments (`attendance_adjustments`), and payroll calculations (`payroll_audit_logs`) are append-only. No records may be overwritten or deleted during active pilot operations.
- **Zero Biometrics / Facial Recognition:** SNR NEST MVP does not compute biometric templates, facial geometry, facial recognition, or automated liveness scoring. Selfie uploads are stored as encrypted evidence artifacts only for physical supervisor review.
- **Privacy By Design:**
  - Photo evidence and PDF payslips are stored in private S3 buckets (`EvidenceBucket`, `PayslipBucket`).
  - Access is granted solely through opaque, short-lived signed URLs generated on-demand for authenticated, authorized principals.
  - Logging strictly sanitizes and excludes tokens, credentials, PII, and request bodies.

---

## 2. Retention Schedule Matrix

| Data Classification | Storage Location | Retention Period | Lifecycle Action | Access Authorization |
|---|---|---|---|---|
| **Raw Attendance Punches** | PostgreSQL (`attendance_events`) | 3 Years | Archived after 3 years; never purged without legal sign-off | Store Admin, HR, System Admin, Auditor |
| **Attendance Photos** | S3 (`EvidenceBucket`) | 1 Year | Retained private; incomplete multipart uploads aborted after 1 day | Short-lived signed URL (Employee self, Store Admin, HR) |
| **Audit Logs** | PostgreSQL (`attendance_audit_logs`, `payroll_audit_logs`) | 5 Years | Append-only immutable history | System Admin, HR, Auditor |
| **Payroll Runs & Items** | PostgreSQL (`payroll_runs`, `payroll_items`) | 7 Years | Kept in immutable locked/reversed state | HR/Payroll, Auditor |
| **Generated Payslips** | S3 (`PayslipBucket`) | 7 Years | Retained private; mandatory `# WATERMARK: Draft - Not for payment` | Employee self, HR/Payroll |
| **Encrypted Database Dumps**| S3 (`BackupBucket`) | 90 Days | Retained encrypted (AES-256); local copies pruned after 7 days | System Admin |

---

## 3. Operational Data Lifecycle Verifications

- [x] S3 buckets configured with `AbortIncompleteMultipartUpload: 1 day` to eliminate abandoned uploads.
- [x] No premature object deletion or transition rules enabled prior to formal statutory qualification.
- [x] Presigned upload URLs expire within 300 seconds.
- [x] Download intents use single-use or short-lived opaque authorization tokens.
- [x] CSV export endpoints neutralize formula injection triggers (CWE-1236) by prepending `'` to unsafe initial characters.

