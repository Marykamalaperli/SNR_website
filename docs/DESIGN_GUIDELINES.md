# Product design guidance

Read `../design_system.md` for palette, fonts, tokens and responsive rules. Keep SNR
NEST warm, practical and concise. Marketing pages describe user value; architecture
details belong in technical documentation.

## Workspace hierarchy

- Employee: attendance action, assigned shift, history, corrections and payslips.
- Store Admin: assigned-store employees, shifts, store QR and exception review.
- HR/Payroll: cross-store directory, attendance lock, payroll validation and release.
- System Admin and Auditor: separate, narrow interfaces without inherited HR powers.

Show payroll only when backed by approved server configuration. Unapproved results
must say `Draft - Not for payment`; do not invent statutory, leave, overtime,
proration or deduction values. Preview data stays visibly synthetic and never calls
private production services.

## Component contract

Reuse `Button`, `Card`, `StatusBadge`, `DataTable`, `FormField`, `Modal`, state
components, `PageHeader`, `Sidebar`, `Topbar` and notifications where compatible.
Migrate reused application components to TypeScript in focused slices and connect
them only to documented target API services.

Use semantic tables with captions and keyboard-scroll regions, persistent labels,
descriptive errors, accessible icon names and native dialogs with focus restoration.
Keep controls at least 44 px, support reduced motion and test 360, 390, 768, 1024
and 1440 px layouts.

Private photos and payslips are never embedded through public URLs or cached by the
service worker. Status always uses text in addition to color.
