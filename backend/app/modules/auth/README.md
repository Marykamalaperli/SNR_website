# Authentication domain

> **Transition note:** The target owns password sessions, roles and store scopes in
> FastAPI/PostgreSQL. The Supabase adapter below is superseded history.

JWT verification lives in `core/security.py`; `/api/v1/session` delegates membership
to `services/memberships.py`. Configured requests use a publishable key and the
verified caller JWT to call the RLS-protected `current_workspace()` RPC. The
unconfigured adapter denies with 503. The default frontend can use that same RPC
directly while Cloud Run is paused. Do not trust user metadata for privileges.
Apply migrations/provision confirmed assignments and validate the real project
before claiming a live connection. Business APIs remain separate future work.
