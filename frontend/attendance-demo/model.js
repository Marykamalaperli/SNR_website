export const DEMO_SITE_ID = '20000000-0000-4000-8000-000000000001';
export const DEMO_QR =
  'snr-attendance:v1:' + DEMO_SITE_ID + ':a0000000-0000-4000-8000-000000000001';
export const INITIAL_SITE = {
  name: 'Bengaluru sample store',
  timezone: 'Asia/Kolkata',
  latitude: 12.971599,
  longitude: 77.594566,
  radius_meters: 100,
};

export const SAMPLE_PHOTO =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><rect width="400" height="320" rx="16" fill="#fff0df"/><circle cx="200" cy="108" r="45" fill="#f4a261"/><path d="M100 265a100 100 0 0 1 200 0" fill="#264653"/><text x="200" y="303" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#264653">Illustrative sample — no camera used</text></svg>',
  );
export function distanceMeters(a, b) {
  const radians = (v) => (v * Math.PI) / 180;
  const value =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
export function checkDemoEvidence(site, point, qr) {
  if (qr !== DEMO_QR)
    throw new Error('This QR does not match your store. Scan the correct store QR.');
  const distance = distanceMeters(site, point);
  if (distance > site.radius_meters)
    throw new Error('Outside the store area. Attendance was not recorded.');
  if (distance + point.accuracy_meters > site.radius_meters)
    throw new Error('Location accuracy is too low. Attendance was not recorded.');
  return distance;
}
export function samplePoint(site, scenario) {
  return {
    latitude: site.latitude + (scenario === 'outside' ? 0.02 : 0),
    longitude: site.longitude,
    accuracy_meters: scenario === 'inaccurate' ? site.radius_meters + 10 : 8,
  };
}
