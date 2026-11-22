---
trigger: model_decision
description: "Load when planning SNR NEST work, interpreting requirements, reviewing architecture, or comparing current code with the target system."
---

# SNR NEST project context

The five numbered DOCX files in `docs/` are authoritative. Use
`05_Source_Aligned_Project_Comparison_and_Implementation_Plan.docx` to transition
from the existing repository. Do not reinterpret old Supabase, Cloudflare, Google
Cloud or personal-QR code as the target when it conflicts with those documents.

Before proposing a major change, read `AGENTS.md`, `README.md`, `design_system.md`,
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md` and
`docs/PROGRESS.md`. For AWS work, also read `docs/AWS_STAGING_PLAN.md` and
`infra/aws/README.md`.

Work from current evidence. Inspect the active branch, status, recent commits,
tests and relevant implementation before stating that a capability exists. Separate
implemented behavior, planned behavior and open decisions in every plan or review.
Update `docs/PROGRESS.md` in the same pull request after implementation. Record
actual checks and external changes without credentials or personal data.
