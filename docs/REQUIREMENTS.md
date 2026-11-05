# Foundation requirements

- Public `/`: responsive navigation, prescribed hero, four features, three steps, footer.
- `/login`: email/password validation, visibility control, real Supabase boundary;
  never fake a successful session or let users select a production role.
- `/me`, `/team`, `/hr`: protected workspaces. Distinct navigation and relevant daily
  tasks, no unsupported KPIs. Private access requires backend-confirmed membership.
- `/preview/me`, `/preview/team`, `/preview/hr`: development-only synthetic workspaces,
  explicit notice, local interactions, no real private API requests, no persistence.
- Employee: attendance action, assigned shift, recent attendance, correction form,
  own documents/profile. Supervisor: team roster, exceptions and recommendations.
  HR: searchable/filterable directory, approvals, sites/shifts, documents/reports.
- Shared semantic controls, modal, table, status, empty/loading/error states; keyboard
  operation, visible focus, reduced motion and layouts at 360/390/768/1024/1440px.
- FastAPI health endpoints, versioned routing, consistent errors, correlation IDs,
  validated config, restrictive CORS, JSON logs and authentication interfaces.
- Reviewable tenant-aware schema and RLS; no live migrations or sensitive business APIs.
- Sitemap from `PUBLIC_SITE_URL` only; public-only indexing, private noindex, SPA refresh.
- ESLint, Prettier, Vitest/RTL, Pytest, production build and GitHub Actions.

Live workforce mutations, database-backed membership, RLS execution against Supabase,
cloud deployment, penetration testing and formal accessibility certification are not
claimed by the foundation. See `DEVELOPMENT_ROADMAP.md` for remaining work.
