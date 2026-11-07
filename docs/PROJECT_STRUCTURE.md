# Project map

Dashboard account administration adds `frontend/functions/` (Pages route adapter),
`frontend/server/` (server-only handler/security checks), an ignored public build
config and private SQL operation records. Runtime admin credentials never enter
frontend source or generated artifacts. See `ADMIN_DASHBOARD_SETUP.md`.

| Path                                       | Responsibility                                                   |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `AGENTS.md`, `design_system.md`            | Contributor rules and shared design decisions                    |
| `docs/`                                    | Architecture, contracts, model, security, testing and operations |
| `frontend/src/app/`                        | Application providers and route definitions                      |
| `frontend/src/layouts/`                    | Public, auth and shared workspace shells                         |
| `frontend/src/components/`                 | Reusable controls, forms, navigation and tables                  |
| `frontend/src/features/`                   | Home, auth and role-specific workspace content                   |
| `frontend/src/features/workforce/`         | Real HR setup/directory, staff forms and scoped profiles         |
| `frontend/src/data/`                       | Synthetic fixtures, imported only by dev preview entry           |
| `frontend/src/lib/`, `services/`, `hooks/` | Configuration, HTTP, session and metadata                        |
| `frontend/src/styles/`                     | Tokens, foundations, components and utilities                    |
| `frontend/src/tests/`                      | Vitest/Testing Library scenarios                                 |
| `frontend/scripts/`                        | Build-time SEO generation and browser verification               |
| `backend/app/api/v1/`                      | Versioned routes                                                 |
| `backend/app/core/`                        | Settings, error handling, token verification                     |
| `backend/app/modules/`                     | Domain boundaries, not pretend operational endpoints             |
| `backend/app/services/`                    | Membership adapter boundary                                      |
| `backend/tests/`                           | Health, validation, auth and middleware tests                    |
| `supabase/migrations/`, `policies/`        | Versioned schema, checked workforce RPCs and isolation guidance  |
| `infra/`                                   | Cloudflare and Cloud Run preparation                             |
| `scripts/`, `.github/workflows/`           | Repeatable local checks and CI                                   |

No empty implementation scaffolds are required; add domain code when its policy and
contract are implemented. Runtime outputs, virtualenvs, `.env`, caches and dependencies
are ignored. No license has been chosen.
