# Store QR, photo and location attendance

Migration 0009 supersedes the photo-storage and capture-order details below for
new punches. See [private buckets and location-first cameras](ATTENDANCE_STORAGE_LOCATION.md).
Older 0008 photos remain readable.

Authorized by the owner's SNR request on 10 November 2026. This replaces the
location-only punch flow after migration 0008 and the frontend release.

## Staff flow

1. Sign in as the assigned Employee and acknowledge sharing a photo and location
   for this attendance event.
2. Choose **Clock in** or **Clock out**, then **Start QR scanner**. Scan the QR
   physically displayed at the store using the rear camera.
3. The server checks that QR against the employee's assigned store (or the
   open session's original store for clock-out). A replaced/foreign QR is refused.
4. Take a fresh front-camera photo, review it and optionally retake it.
5. **Confirm clock in/out** requests one fresh precise device location. PostgreSQL
   requires distance from the admin's saved store centre **plus reported
   accuracy** to fit inside the configured radius. Both punches use this rule.
6. The server saves its timestamp, event/audit, GPS/store-policy snapshot and
   photo/QR proof in one transaction. Any rejection rolls everything back.

Camera and location require HTTPS (or local loopback in development) and browser
permission. No gallery upload, microphone access, background capture or facial
recognition is added. Cameras stop on step completion, cancellation and navigation.
The QR decoder and encoder run locally; no image is sent to a QR service.

The browser keeps an uncertain submission in memory with its original request
UUID, employee/state snapshot, location, QR and photo. **Check attendance request**
replays that same intent, without another camera/location capture. A committed
exact replay survives QR rotation or capture expiry; changes to proof are rejected.
Reloading discards the in-memory proof, so refresh status before a new attempt.

## Admin setup in Sites & Shifts

**Add site** now requires the store latitude, longitude and allowed radius
(10–1,000 metres, default 100). **Use my current location** only runs on explicit
selection, while the admin is at the store; review the result before saving.
Site details, area and initial QR are saved atomically. **Edit site** loads the
saved area and versions; stale edits fail without partially saving.

Existing sites keep their history. Configure their area using **Edit site** or
**Manage attendance area**, then open **Store attendance QR** and download the
PNG to print/display at that store. HR can explicitly replace the QR, invalidating
older copies for new punches. It does not change previously committed evidence.

Only the HR role has these setup capabilities; Supervisor, Auditor and System Owner
do not inherit HR access. Employee RPCs never expose a store's QR secret.

## Evidence and privacy

Camera frames are resized to at most 640 pixels and encoded as JPEG; the server
requires a bounded JPEG (150 KiB), a fresh capture time and notice version
attendance-photo-location-v1. GPS retains attendance-location-v1 plus the
existing store-radius-v1 snapshots. New photo/QR evidence is private, append-only,
and tied to the attendance event. Historical records are not backfilled.

For this bounded MVP, JPEG bytes are stored in snr_private.attendance_evidence,
not a public Storage bucket. No additional credential or bucket provisioning is
needed. The tradeoff is database growth of up to 300 KiB per paired work session.
Evidence follows attendance retention, with no automatic deletion in this change.
Any later retention/export/storage migration requires a deliberate owner policy.

Employee-self and HR within the organization can open the existing **View
photo & location** action to see the photo, precise GPS and QR version for each punch.
The scoped RPC audits that detail access. Supervisors get neither photos nor
precise coordinates; there are no browser table grants or persistent image URLs.
Photo/QR data must not be logged, put in localStorage, included in normal lists
or exported into the synthetic preview store.

The QR is a printable, replaceable store code, not a rotating proof of presence.
Device coordinates and camera frames come from an untrusted browser. These checks
do not certify location authenticity, liveness, identity or a face match.

## Activation

The project owner applies supabase/migrations/202611100008_attendance_photo_qr.sql
once after migrations 0001–0007 in the intended Supabase project. Then release the
frontend, including its camera=(self) Permissions-Policy. No live migration or deployment
is run by this coding task. Until 0008 is installed, the new client blocks the flow
and explains the missing migration; older clients cannot bypass the new writer.

Test with an assigned Employee at a configured store: both punches, retake,
camera/location denial, wrong/replaced QR, outside and inaccurate position,
lost-response retry, photo/GPS history, HR access and Supervisor denial.

Local verification: bash scripts/test-supabase.sh exercises real disposable
PostgreSQL authorization/transactions, QR rotation and overlapping HR site edits
with a photo punch; frontend unit tests exercise
capture/retry orchestration; browser tests run the actual QR pixel decoder and
canvas JPEG encoder with synthetic camera streams. These do not establish live
provider activation or physical-device GPS/camera acceptance.
