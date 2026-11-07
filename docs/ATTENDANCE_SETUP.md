# Attendance and employee shifts

The owner subsequently requested location on both punches. Activate the additional
[location migration 0006](ATTENDANCE_LOCATIONS.md) after the attendance setup below.
It preserves existing attendance and requires a fresh permitted device fix for
new punches; do not rerun migration 0005 after attendance exists.

The attendance release adds dashboard-managed employee shift assignments, normal
clock-in/out, personal history/schedules, supervisor team attendance and an HR
overview. Google Cloud remains paused. It uses the existing Supabase caller JWT
and narrow database functions; attendance does not use the administrative key.

## One-time activation

1. Apply only [202611070005_attendance.sql](../supabase/migrations/202611070005_attendance.sql)
   in the existing project's SQL Editor, after migrations 0001–0004. Do not rerun
   previous migrations or anything under `supabase/tests`. The migration refuses
   to proceed if pre-existing attendance needs an explicit import review; it never
   rewrites or deletes that history.
2. Run **GitHub Actions → Deploy application → Run workflow → main → frontend**.
   Existing public configuration and the account-management binding stay in place.
3. Reload the website. All following routine work happens in SNR NEST.

## Assign a shift from the HR dashboard

1. In **Sites & Shifts**, create a shift template at the employee's site. It uses
   that site's IANA time zone. For an overnight shift, the end time is earlier
   than the start time.
2. In **Employees → Manage shifts**, select an active Employee, choose a template,
   its start date and an optional end date. A blank end date means ongoing.
3. Save. An employee has one assignment per work date; overlapping dates are
   rejected. **Change end date** can finish a current/upcoming assignment before
   another begins. Dates already used by attendance cannot be shortened away.
   **Cancel assignment** retains an unused current/future record as cancelled.

The form shows up to 50 assignments and checks employee/assignment versions.
The server rejects other-tenant/site templates, inactive profiles and protected
roles. Past schedules cannot be rewritten. Template hours are frozen once a
template has been assigned; create another template for different hours.
Supervisor/HR self-punch permissions require a separate reviewed role model and
are not implicitly granted here.

## Record and review a workday

- Employee **Dashboard / My Attendance:** see the assigned shift and recorded
  state; choose **Clock in**, then **Clock out** when finished. The original
  timestamps come from PostgreSQL. **My Schedule** lists assigned dates/hours.
- Employee history remains after reload. Several completed sessions on the same
  date are allowed; gaps between them are not counted. An open session has no
  completed-duration total yet. There is no automatic clock-out or daily reset.
- **Team Attendance** shows the supervisor's permitted department/site pairs.
  Supervisors can read and filter; they cannot punch or edit records for staff.
- HR **Attendance** shows organization records with date, person, site, department
  and open/closed filters. Each request covers up to 31 calendar dates and returns
  20 rows per page. Summary counts/time cover all authorized matches, not just
  the visible page. Open sessions outside the selected dates are not included.

Dates and displayed times use the captured shift time zone. An overnight shift
still running after midnight resolves to its previous start date until its
scheduled end. Checkout copies the original session's date/assignment/time-zone
snapshot even after that assignment ends. Completed time is actual UTC elapsed
time between paired punches, including DST changes. Scheduled hours are context;
there is no early/late cutoff, lateness, absence, overtime, payroll or automatic
break deduction in this release.

## Connection loss and access changes

Each action carries a UUID and the last recorded event ID. **Check attendance
request** retries that exact intent after an uncertain response; it does not
toggle to the opposite action. A committed intent returns its receipt without
another event/audit. A different simultaneous/stale action is rejected. Reload
fetches the actual server state before a new action can be chosen.

An employee needs active membership/profile access to punch. Workspace revocation
still works while clocked in; a new request is denied. Site deactivation prevents
new clock-ins but permits an authorized employee to finish an existing session.
Site/department/role changes are blocked while a normal session remains open.
The employee must clock out before HR makes those changes.

History is append-only. Employee moves do not transfer historical attendance to
a newly assigned supervisor: both current profile scope and the original event
site/department must match. Employees keep access to their own history; HR stays
within its organization and does not acquire audit-reading rights.

HR cannot edit original punch timestamps. Corrections and supervisor/HR approval
remain the next workflow; no corrective events, forced closures or selfies are
exposed. Per-event device locations use the separate consent/access contract in
the location guide above.

## Verification

Local PostgreSQL tests exercise real database roles, dates/DST, server-time writes,
replay/stale state, tenancy, scope, revocation and append-only history. Separate
connections force overlapping punches, revocation and HR reassignment. Browser
checks use the real SDK against intercepted synthetic HTTP contracts for shift
assignment, clock-in/out, lost-response recovery, persistence, filtering and mobile
accessibility. They do not use a live employee or private credential.

After activation, verify one Employee clock-in/out and confirm the same record
appears for its assigned Supervisor and HR. Also confirm a different team cannot
read it. No SQL editor step is needed for daily assignments or attendance.
