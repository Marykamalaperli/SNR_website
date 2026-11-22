# Identity domain

The target owns password identities, opaque access/refresh sessions, roles and
organization/store scopes in PostgreSQL. Passwords use Argon2id. Only SHA-256 token
digests are persisted; raw tokens exist only in HttpOnly cookies.

`POST /api/v1/auth/login`, `/refresh` and `/logout` require an exact configured
Origin. Cookies are SameSite=Lax and Secure by default; production rejects an
insecure cookie setting. Refresh rotates both tokens, logout revokes the database
session, and deactivation or token-version change invalidates existing sessions.

`GET /api/v1/me` returns only server-owned active role assignments. Authorization
helpers match exact roles and organization/store scope; browser claims are never
accepted as authority.
