# Product design guidance

Read `../design_system.md` for palette, fonts, tokens and responsive rules.
Keep SNR NEST short, warm and practical. The homepage describes the value to people;
technical architecture belongs in these documents, not the marketing footer.

## Workspace hierarchy

- Employee: attendance action first, assigned shift second, history and corrections next.
- Supervisor: assigned team, attendance exceptions and review queue; no final approval.
- HR: directory, organizational attendance and approval queue; no auditor/owner tools.

Avoid unsupported payroll, performance and leave estimates. Derive sample counts
from fixtures and keep the preview notice visible. Do not label sample data live.
Use “Approve Request”, “Reject Request”, and “Request Correction” rather than internal
engineering terms. Clocked out is an ordinary completed state.

## Component contract

`Button`, `Card`, `StatusBadge`, `DataTable`, `FormField`, `Modal`, state components,
`PageHeader`, `Sidebar`, `Topbar` and `NotificationIndicator` are shared. Each role
has distinct content within `DashboardLayout`. Preview content is imported only by
the development entry; do not import fixtures or preview-only role components into
production shells.

Use semantic tables with captions and an internal keyboard-scroll region, input
labels and descriptive errors, accessible icon names, and keyboard-operable native
dialogs with focus restoration. Keep primary actions visible and purposeful.
Test zoom/reflow, empty filters, long text, keyboard navigation and reduced motion.
Do not add a privacy link until an approved privacy page exists.
