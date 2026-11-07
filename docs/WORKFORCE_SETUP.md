# Activate organization setup and the employee directory

The owner confirmed that live sign-in works. This release connects real workforce
records to HR organization setup, employee onboarding/editing, an employee's own
profile and the supervisor's assigned roster. Cloudflare still hosts the frontend;
Google Cloud stays paused. No new frontend key or server secret is needed.

## 1. Apply the new migration

In the existing [Supabase project](https://supabase.com/dashboard/project/emvppphhkmbpgqduikup/sql/new),
open **SQL Editor → New query**. Copy the full contents of
[202611070003_workforce_directory.sql](../supabase/migrations/202611070003_workforce_directory.sql)
and run it once as the project owner. It requires the two migrations already used
for authentication. Do not rerun the foundation, reset the database, or apply test
files. If this migration has already succeeded, do not run it again.

The migration adds version columns/triggers and narrowly authorized functions;
it preserves existing records and the sign-in RPC. Direct browser table writes
remain denied. A failed query rolls back its changes. No live database has been
changed by this coding task.

## 2. Deploy the frontend

After the code is on `main`, open GitHub **Actions → Deploy application → Run
workflow → main → frontend**. Keep the existing public Supabase variables and
Cloudflare deployment secret. No backend/Google deployment is required.

Without the migration, the new screens show an actionable setup error; they do not
fall back to sample records.

## 3. Set up your workplace

Sign in as your existing HR account. Open **Sites & Shifts** (`/hr/sites`):

1. Add a site, using a name and IANA time zone such as `Asia/Kolkata`.
2. Add a department, such as Operations.
3. Optionally add a shift template. Times use the site's time zone; an end time
   before the start time ends the next day. Equal start/end times are rejected.
   Templates do not assign working days or clock anyone in.

Names can be edited. Duplicate normalized names are rejected within their scope.
Sites and departments are retained rather than deleted. Changing a site's time
zone does not rewrite an existing shift's captured time zone. Once a shift is
assigned or has attendance history, changing its hours/site/time zone is blocked;
create a new template instead. A name-only edit remains available.

## 4. Add an employee and supervisor

Create two application accounts under Supabase **Authentication → Users → Add user
→ Create user**, using email/password and **Auto Confirm User**. The email must
appear as confirmed in this project's Auth user list. Enter passwords only in
Supabase. The HR form does not create credentials, send invitations, reset
passwords, or change account emails.

Open **Employees → Add employee** (`/hr/employees`). Enter the confirmed account
email, full name, unique employee number, site and department. Select Employee or
Supervisor and choose Active or Inactive account access. Create one profile of
each role. A supervisor's scope is the selected department **and** site. Existing
multi-assignment supervisors require project-owner review and are not overwritten.

Only active HR members of a single organization can save these records. They
cannot grant HR/auditor/owner roles, change their own HR account, downgrade a
protected account, or attach an account assigned to another organization. A new
account receives its membership and profile together; the manual employee
membership helper is unnecessary for this flow. HR provisioning itself still
belongs to the project owner.

For existing profiles choose **Edit**. Inactive disables workspace data access on
the next request and retains the profile. Use **Access → Inactive accounts** to
find and explicitly reactivate an existing profile. Add employee never silently
re-enables a revoked membership. Reopen and refresh stale forms before retrying;
both profile and membership versions are checked, including owner-made changes.

## 5. Verify role access

- HR: `/hr` shows actual staff/site counts. `/hr/employees` searches names/numbers,
  filters site/department/access and pages 20 records at a time.
- Employee: sign out, then use the Employee account. **Profile** (`/me/profile`)
  shows that person's real department, site, organization and employee number.
- Supervisor: sign out, then use the Supervisor account. **Team Members**
  (`/team/members`) shows only the assigned department/site roster. Neither staff
  role receives HR saves or other employees' account emails.
- Refresh and confirm records remain. Test inactive access with a test account,
  not the sole HR administrator. After changing a role, sign out/in so navigation
  also reflects the change.

Saves append server-generated audit entries in the same transaction. HR does not
inherit audit-reading privileges. Actor, organization and audit request ID come
from PostgreSQL, not form authority. Unassigned/revoked/ambiguous accounts are
denied even with a valid Auth token. Browser role metadata never grants access.

Attendance punches, shift assignments, corrections, HR decisions, documents and
exports remain future work. Their production pages retain honest empty states.
No preview action becomes a real transaction in this release.

## Local verification

`bash scripts/test-supabase.sh` applies every migration to disposable local
PostgreSQL and exercises authorization/save scenarios. Never apply
`supabase/tests/` to a customer project. Frontend/browser checks cover forms,
failures, search/pagination, scoped screens and accessibility. Browser HTTP uses
intercepted contracts; live account/data testing needs the owner's project after
activation.
