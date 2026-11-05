# Authentication domain

JWT verification lives in `core/security.py`; `/api/v1/session` delegates membership
to `services/memberships.py`. The default adapter denies access with 503. Implement
active assignments, revocation and team/site scope against trusted PostgreSQL data
before enabling real workspaces. Do not trust `user_metadata` for privileges.
