# Clock-in and clock-out locations

The owner requested device location capture and storage for both attendance
actions. Notice version `attendance-location-v1` covers this per-event purpose:

> Your device location is saved with this attendance event for attendance
> verification. You and HR can view it. Accuracy depends on your device.

Staff must select **I agree to share my location for this attendance event** and
grant the browser's location permission. The app requests one fresh device fix
only after that action. It does not request location when opening a page or run
continuous/background tracking. Denied permission, unavailable position and
timeouts leave attendance unchanged and show an actionable error.

## One-time activation

1. In the existing Supabase SQL Editor, run only
   [202611070006_attendance_locations.sql](../supabase/migrations/202611070006_attendance_locations.sql)
   after migrations 0001–0005. Do not rerun migration 0005 against existing
   attendance or run files under `supabase/tests` in the live project.
2. Run **GitHub Actions → Deploy application → main → frontend** and reload the
   website. This deployment enables `geolocation=(self)` in the Pages response
   policy. The updated client checks the server's matching notice version before
   it requests any location.
3. Staff acknowledge the notice, allow location (enable **Precise location** on
   supported mobile devices), and clock in/out. Location services must be enabled.

No new hosting resource, Google project, map SDK, billing or secret key is used.
Existing account/shift setup continues through the dashboard.

## Saved fields and accuracy

Each new punch saves its own latitude, longitude, reported accuracy in meters,
device capture timestamp, authoritative server receipt time and notice version.
Coordinates retain the reported precision in the database. The device is asked
for high accuracy, with no cached position; an initial fix must be within two
minutes of server receipt and no more than 30 seconds ahead. Incorrect device
date/time can therefore require enabling automatic time before retrying.

Attendance timestamps remain server-generated. Device time/location never
overrides the employee, organization, shift/work date or punch timestamp. The
expected employee ID is a snapshot check, not permission to choose another person.

Device positions can be approximate or spoofed. The UI shows reported accuracy;
this feature does not certify exact physical presence or enforce a site radius.
No altitude, heading, speed, selfie, movement history, reverse-geocoded address or
additional tracking identifier is requested. Location records are retained with
attendance; this release adds no automatic retention purge.

## View locations in SNR NEST

The employee and HR can use **Attendance → View locations** to see separate
Clock-in/Clock-out coordinates, accuracy and timestamps. A map link opens the
selected point in OpenStreetMap only when chosen, in a new tab without a referrer.
The application does not load an external map or geocoding service automatically.

Supervisors retain scoped attendance reads but receive no precise locations or
location flags. A supervisor cannot acquire coordinates by calling the detail
RPC directly. Other employees, other organizations, inactive memberships, system
owners and security auditors do not acquire these location-view permissions.
HR sees only its authorized organization and still cannot read the private audit.

The location table is private, RLS-enabled and has no browser SELECT/write grants.
The narrow detail RPC verifies role, tenant and record ownership, and appends a
minimal view-audit event without coordinates. Regular history lists contain only
availability flags for authorized viewers, keeping coordinates out of list loads.
Locations are immutable alongside the original attendance evidence.

## Existing records, interruptions and validation

The migration preserves every existing punch/time. Earlier punches show
**Not collected**; no current position is used to invent a historical fix. An
already open session can finish with a new clock-out location while its earlier
clock-in remains without GPS.

The normal event, audit and private location commit in one transaction. A failed
location insert rolls back the new punch/audit. **Check attendance request**
resubmits the original action, subject/state snapshots and captured fix without
another GPS request. Matching committed requests recover even after the fix ages;
changed coordinates/accuracy/capture time cannot overwrite the original receipt.
The old location-free API and direct private helper execution are denied. A
pending device fix is discarded when leaving the screen, and a changed employee
snapshot is denied by the server.

Local checks use synthetic coordinates and disposable PostgreSQL. They exercise
legacy upgrades, field bounds/freshness/notice, atomic rollback, exact replay,
revocation, role/tenant/ownership denial and concurrent requests. Browser checks
use Chromium's simulated position provider, including separate in/out locations,
consent/denial, safe recovery, map links, HR viewing and supervisor restrictions.
This does not claim that real GPS hardware or the live project was tested.
