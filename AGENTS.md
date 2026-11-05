# Working on SNR NEST

Read `README.md`, `design_system.md`, `docs/ARCHITECTURE.md`, and
`docs/DECISIONS.md` before major changes. Use the existing checkout; cloud tasks
are already isolated. Do not create worktrees unless explicitly requested.

## Project rules

- Frontend: JavaScript (ES2022+) and JSX, React, Vite. No TypeScript application
  files, TS configuration, or annotations. Backend: Python and FastAPI.
- Keep domains modular; reuse components and CSS tokens. No unrelated changes,
  silent deletion of user files, or major dependency upgrades without justification.
- Preserve functionality during refactors. Document important architecture decisions.
- Never hardcode credentials, put server secrets in Vite variables, or commit `.env`.
- The browser is untrusted. Identity, organization, role, team/site scope, attendance
  timestamps, and approval authority belong on the server. Follow the permissions
  matrix in `docs/SECURITY.md`; HR never inherits auditor or owner permissions.
- Do not invent backend functionality or imply a planned endpoint is operational.
- Synthetic data belongs only in development previews. A role switch or a client
  route guard is never authorization. Never connect previews to private records.
- Use concise, human-friendly UI text, useful fields, consistent responsive behavior,
  and accessible controls. Avoid unsupported KPIs, payroll, or leave calculations.
- Preserve append-only attendance and audit history. No location collection without
  an approved consent policy; no facial recognition in the MVP.
- Do not push, deploy, provision cloud resources, or apply live migrations without
  explicit authorization. No license is selected yet.

## Coding standards

Use functional React components, hooks, small reusable modules, clear names, and
service functions for I/O. Keep business logic out of deeply nested JSX. Add
dependencies only for a clear purpose. Python uses type hints, FastAPI routers,
Pydantic schemas, dependency injection, service-layer rules, and testable authorization
boundaries. Keep structured logs free of tokens and personal data.

## Completion rules

Review changed and untracked files. Run formatting, linting, applicable meaningful
tests, and the frontend production build. Test startup and representative requests
when services change. Report commands and actual results, including skipped checks
and blockers. Never claim an unexecuted check passed. Update documentation when
behavior or architecture changes.
