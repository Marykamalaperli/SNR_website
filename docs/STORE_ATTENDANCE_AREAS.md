# Store attendance areas

Both clock-in and clock-out require a fresh device position inside the assigned
store’s attendance area. HR sets the actual store centre and allowed radius in
the dashboard. The default is **100 metres**, adjustable from 10–1,000 metres.
Permission denial, missing store setup, outside positions and insufficient
accuracy leave attendance unchanged.

## One-time activation

1. Apply migrations 0001–0006 first. If 0006 is not installed, apply
   [202611070006_attendance_locations.sql](../supabase/migrations/202611070006_attendance_locations.sql)
   once using the existing Supabase SQL Editor. Do not rerun migration 0005 against
   existing attendance and never apply files under `supabase/tests` to production.
2. Apply only the new
   [202611080007_store_attendance_areas.sql](../supabase/migrations/202611080007_store_attendance_areas.sql)
   once. Existing events/GPS are preserved. New punches immediately require a
   configured store area, including open sessions awaiting clock-out.
3. Run [GitHub Actions → Deploy application](https://github.com/Marykamalaperli/SNR_website/actions/workflows/deploy.yml)
   with branch **main** and target **frontend**, then reload the website.
4. Sign in as HR. Open **Sites & Shifts → Manage attendance area** for each store.
   While at the store, choose **Use my current location** and allow browser
   location access, or enter the store’s latitude/longitude. Review the centre,
   set the radius and choose **Save attendance area**. All later updates use this
   dashboard; no routine SQL editing is needed.
5. Employees enable location services and precise location, acknowledge sharing,
   and choose **Clock in** or **Clock out**. Each new punch automatically requests
   a fresh fix. The browser still requires location permission.

No new key, Google Cloud billing, mapping service or hosting resource is required.
There is no disable/override switch for these checks. Store configuration does not
give HR permission to change historical punch times or original GPS.

## Enforcement and evidence

PostgreSQL derives the employee, organization, event time, shift and store. The
client cannot choose a store for a punch. Clock-out uses the store recorded at
clock-in, with that store’s current area settings, even if the shift has ended or
the site is inactive. Existing open sessions also need a configured store area.

Great-circle distance is calculated in metres. A punch is allowed only when
**distance from centre + reported location accuracy ≤ allowed radius**. For
example, a position 95 metres from a 100-metre store centre with ±10-metre accuracy
is rejected. Accuracy never increases the allowed radius. Move closer to the
store, enable precise location and request another fix when accuracy is poor.

Each accepted event saves the location and its immutable store-centre, radius,
policy version and calculated distance snapshot. A failed distance check rolls
back the event, location and punch audit together; rejected fixes are not stored.
Employee/HR **Attendance → View locations** shows the original distance, radius
and version. Earlier GPS displays **Recorded before store area checks** and is
never backfilled or reclassified.

**Check attendance request** reuses an uncertain request’s exact original fix.
An already committed request returns its original receipt even after settings
change; it creates no new attendance. A rejected attempt can request a new fix.
Configuration saves use versions to reject stale concurrent edits. Area locks keep
the selected settings stable while a new punch commits.

This is a check of device-reported coordinates and accuracy. Browsers/operating
systems can provide approximate or spoofed positions; this is not independent
proof of physical presence. The approved notice and per-event consent remain in
[attendance locations](ATTENDANCE_LOCATIONS.md). No location is collected on page
load or continuously in the background.

## Validation and acceptance

`bash scripts/test-supabase.sh` applies all migrations to disposable PostgreSQL
with synthetic fixtures. It checks pre-existing attendance/GPS preservation,
role/tenant isolation, private-table denial, coordinate/radius bounds, stale
configuration edits, great-circle distance (including the date line/poles),
missing setup, outside/uncertain clock-in and clock-out, atomic rollback,
configuration changes during an open session, policy snapshots, exact replay,
revocation and concurrent punches/reassignments.

Frontend component/browser tests check dashboard setup, explicit store-location
capture, blank initial coordinates, radius persistence, blocked unconfigured
stores, outside/poor-accuracy attempts, fresh in/out positions, denied permission,
retry recovery, precise-location access, mobile layouts and accessibility.
Automated browser coordinates are simulated, not live GPS hardware.

After activation, verify one employee at the actual store and outside its radius:
both actions must succeed inside with adequate accuracy and be rejected outside,
with no extra history entry after a rejected attempt. Check saved locations and
policy details from HR. These live checks require the configured project/device;
local automated results do not claim that production was activated or verified.
