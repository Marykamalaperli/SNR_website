# Photo-only attendance within 50 metres

Migration 0010 implements the owner's 11 November 2026 instruction to disable
store QR scanning. It extends 0009 and preserves original attendance history.

## Staff flow

1. Agree to the per-event photo/location notice and click Clock in or Clock out.
2. The browser requests a fresh precise location. Supabase verifies the employee,
   expected attendance state, assigned/open-session store and shift rules.
3. The selfie camera opens only when the reported location and its accuracy circle
   fit inside 50 metres of that store. Outside, unavailable, denied or uncertain
   GPS never opens it. Browser permissions already granted may be reused by the OS.
4. At Take photo, obtain another fresh server-checked fix before reading the frame.
5. Review/retake and confirm. The photo goes into the existing private
   attendance-clock-in or attendance-clock-out Supabase bucket, respectively.
   Its server-derived filename remains user ID + UTC date/time + request UUID.

Camera checks stop streams on a failed periodic location check, permission removal,
page hiding, cancel or navigation. There is no facial recognition, auto shutter,
file-picker bypass or background tracking. Browser GPS remains device-reported.

## Server policy and history

0010 changes all configured store radii to 50 metres, increments versions for
changed areas and sets a table constraint/default. HR can still save coordinates
and map links; the radius is fixed. Both preflight and commit recheck the server
store area. Clock-out uses the original open session's store. Accuracy does not
expand the radius. Existing GPS snapshots, timestamps, photos, QR versions and
append-only audit/event history are retained unchanged.

New site creation no longer creates a QR. Old QR display/rotation/verification RPCs
return store_qr_disabled; their private rows remain for historical proof. A legacy
optional QR string is inert in upload payloads, allowing exact old requests to
retain their fingerprints. New evidence has null QR version/false verification.
The detail reader keeps true verification for historical QR evidence only.

The existing verified-upload reservation, same-request recovery, caller-JWT
attendance transaction, server-only SUPABASE_ADMIN_KEY, RLS restrictions and
60-second signed URLs are unchanged. An interrupted upload may leave an
unreferenced private object, as documented in ATTENDANCE_STORAGE_LOCATION.md.

## Activate

1. Ensure migrations 0001–0009 are installed. Do not rerun applied migrations.
2. In Supabase SQL Editor, apply
   supabase/migrations/202611110010_attendance_location_photo_only.sql once.
   Existing configured store centres/map links stay; their radii become 50 metres.
3. Keep the Cloudflare Pages Production secret SUPABASE_ADMIN_KEY configured.
4. Run GitHub Actions → Deploy application → Run workflow, main, target frontend.
   Pushing main alone does not deploy. A new frontend blocks punching against an
   older QR policy until 0010 is present.
5. Test both actions with an assigned employee over HTTPS: inside 50 metres,
   outside 50 metres, denied GPS/camera, insufficient accuracy, movement before
   shutter, retake/cancel, private photos and lost-response recovery.

Read-only installation check:

```sql
select to_regclass('snr_private.site_attendance_areas') is not null
  and exists (select 1 from pg_constraint where conrelid = to_regclass('snr_private.site_attendance_areas')
    and conname = 'site_attendance_fixed_radius') as migration_0010_present;
```

Local SQL tests apply 0001–0010 in disposable PostgreSQL with real Storage RLS
and stub object metadata, verifying both photo-only actions, 40/55-metre fixes,
accuracy, commit-time store changes, fixed radius saves and legacy history.
Node/Cloudflare runtime tests verify upload bytes/auth/order with substituted
Storage HTTP. Browser checks use actual location/video/frame APIs with fixture
camera hardware; isolated demo checks never contact production services.
Live migration, real provider uploads and deployment require owner activation.

## Local validation · 11 November 2026

| Command or check | Result |
| --- | --- |
| npm run format:check; npm run lint | Passed |
| npm run test -- --maxWorkers=3 | 150 tests passed |
| npm run test:server | 24 tests passed |
| npm run build | Passed |
| npm run test:browser (system Chromium) | 40 tests passed |
| npm run demo:test (system Chromium) | 5 tests passed; isolated demo build passed |
| bash scripts/test-supabase.sh | Migrations 0001–0010, permissions, attendance and concurrency checks passed |
| scripts/test-worker-runtime.mjs with Wrangler 4.158.0 | Upload/account checks passed at both tested compatibility dates |
