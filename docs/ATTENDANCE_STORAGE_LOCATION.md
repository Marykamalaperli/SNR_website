# Store map links, location-first cameras and private photo buckets

> The current flow is **location → photo within 50 metres**, with QR disabled.
> Apply migration 0010 after earlier migrations. See [photo-only attendance](ATTENDANCE_PHOTO_ONLY.md).

Owner request: 11 November 2026. Migration 0009 extends 0008; it never rewrites
existing attendance or removes old database photos.

## Store location links

HR can paste a Google Maps, Apple Maps or OpenStreetMap link into **Store location
link** while adding/editing a site or managing its attendance area. Explicit place
coordinates take priority over a map viewport. The coordinates fill automatically;
review the pin and radius before saving. A viewport-only link is labelled as a map
centre. Manually changing a coordinate clears the link to avoid an inconsistent pair.

Short Google Maps links are expanded by an authenticated HR-only Pages endpoint.
It follows at most five manual redirects to approved HTTPS map hosts, sends no
workspace credentials to those hosts and refuses other hosts/ports. Links with
only a place name/ID may have no extractable position; use a full pinned map link
or enter coordinates. No geocoding key, guessed address or third-party browser SDK
is introduced. The reviewed link is saved with the versioned store area.

## Location before camera and at the shutter

The staff consent covers per-event photo/location and location checks while the
capture dialog is open. A fresh successful device fix and server store-area check
are required before opening both QR and selfie cameras. Denial, an unavailable
position, an outside fix or insufficient accuracy leave the camera unopened.

The selfie shutter takes another fresh fix and server check before reading the
camera frame. The checked fix is sent with the photo, not replaced by a later
unrelated location. Server preparation requires its device time and the photo time
to be within ten seconds, with the fix at most thirty seconds old. Upload reservation
expires after two minutes; normal punch/GPS transactions independently recheck
state, QR and the current store radius at commit.

During an active camera, ten-second checks and geolocation permission changes
stop the stream on failure. Hiding the page pauses the camera. Navigation/cancel
stops all checks and streams; a late result cannot restart a cancelled capture.
Browser APIs expose fixes and permissions, not an independent GPS-switch or
physical-presence attestation. No facial recognition or background tracking is added.

## Buckets and filenames

New JPEGs are uploaded into two private Supabase Storage buckets:

| Action | Bucket |
| --- | --- |
| Clock in | attendance-clock-in |
| Clock out | attendance-clock-out |

The server reserves each object's path:

    <organization-id>/<auth-user-id>/<auth-user-id>_<YYYY-MM-DD>_<HH-MM-SS.microseconds>_<request-id>.jpg

Date/time uses the server's UTC upload-reservation time. The user ID is the
verified Supabase Auth UUID; the suffix prevents collisions and supports exact
retry. The browser cannot select another bucket, filename, owner or timestamp.
Images are bounded JPEGs (640 pixels, 150 KiB), with no-store cache metadata.

The new Pages photo endpoint uses the existing private SUPABASE_ADMIN_KEY binding
only for uploading/reading back exact server-reserved objects and certifying their
digest. Auth identity is checked first; all employee, state, location, QR,
reservation and attendance decisions use the caller JWT and SQL role checks.
No privileged key enters Vite, browser configuration or logs.

SQL validates the JPEG, derives a SHA-256 digest and freezes the action in a private
upload intent. The server uploads without overwrite; a duplicate object is read back
and must match that digest. A service-role-only RPC certifies object metadata before
the caller-scoped transaction atomically appends attendance, GPS, the object reference
and audit. A network interruption retries the same intent and never takes a second
photo or writes a second punch. A committed receipt is returned without reupload.

Storage and PostgreSQL cannot share a transaction. An interrupted/expired upload
may leave an unreferenced private object, never a partial attendance event. Such
objects have no staff read access; retention cleanup must check the intent's expiry
and absence of a committed event before an administrator removes one. The app does
not blindly delete objects after an uncertain response.

Only employee-self and HR within the organization can read committed objects.
Supervisors, other employees/organizations and anonymous users cannot. Restrictive
Storage policies prevent browser writes/deletes even alongside broader unrelated
policies. The existing audited detail reader returns object references, and the
caller SDK requests sixty-second signed URLs. Old database photos remain readable;
they are not backfilled or deleted. No automatic change to retention is included.

## Activation

1. Keep migrations 0001–0008 and their existing records.
2. Apply supabase/migrations/202611110009_attendance_storage_location.sql once.
   It creates the two private buckets, scoped policies and new RPCs. If those bucket
   names already have incompatible privacy/type/size settings, the migration aborts
   for owner review instead of changing an unknown bucket.
3. Verify the Cloudflare Pages production binding SUPABASE_ADMIN_KEY is already
   configured as a secret (the same server-only binding used for staff account
   management). Set it there if absent; never use a VITE_ variable.
4. Deploy the frontend and Pages Functions from main using the repository workflow.
   API routing includes /api/attendance/*; image CSP permits private signed URLs.
5. Test map-link entry, both buckets and filename format, denied/outside/uncertain
   GPS before camera, movement before shutter, interrupted uploads and scoped reads.

No live migration, bucket provisioning or deployment is performed by local tests.
Real PostgreSQL checks use a disposable Storage metadata schema and actual RLS;
Node/Workers tests substitute Storage HTTP while verifying bytes/auth/order;
browser tests exercise native camera streams and signed-URL rendering with fixtures.
