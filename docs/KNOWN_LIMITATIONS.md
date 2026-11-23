# SNR NEST Known Limitations & Statutory Scope Boundaries

**Version:** 1.0  
**Effective Date:** 23 November 2026

---

## 1. Statutory Payroll Boundaries (SRS P-01 through P-10)

Per authoritative project instructions in `AGENTS.md` and SRS:
- **Mandatory Compliance Watermark:** All payroll artifacts, previews, calculation runs, payslip PDFs, and CSV exports remain prominently stamped with:
  `# WATERMARK: Draft - Not for payment`
- **Scope Qualification:** Statutory deductions (Provident Fund, ESI, Professional Tax, TDS/Income Tax), statutory bonus, overtime multiplier formulas, proration, rounding variations, and statutory leave accruals remain **Draft - Not for payment** until decisions P-01 through P-10 are formally qualified and signed off by legal and accounting counsel.
- **No Floating-Point Arithmetic:** Calculations use exact Python `Decimal` with `ROUND_HALF_UP`.

---

## 2. Hardware and Biometrics Limitations

- **No Facial Recognition / Biometrics:** The MVP does not perform automated liveness detection, facial matching, or biometric template extraction. Capturing an attendance photo serves strictly as physical visual verification evidence.
- **Location & Device Telemetry:** Geolocation coordinates and device user-agents are captured as optional audit metadata. PWA punch approval does not depend on invasive device fingerprinting.

---

## 3. Infrastructure & Scalability Boundaries

- **Single-Node Pilot Deployment:** Pilot runs on a single hardened Ubuntu instance with Docker Compose. PostgreSQL is not configured for multi-master clustering or automated multi-region failover.
- **Local Dev vs. Cloud Presigned Storage:** In local native development without AWS credentials, photo uploads and evidence endpoints route to local development receiver (`/evidence`). Presigned S3 URLs are active in AWS staging/production environments.
- **Shared In-Memory Rate Limiting:** The pilot uses route-level and authentication rate limiting. Multi-instance horizontal scaling will require backing rate-limiting state with a shared Redis or database tier.

