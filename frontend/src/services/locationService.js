export const LOCATION_NOTICE_VERSION = 'attendance-location-v1';

export async function captureDeviceLocation({
  geolocation = globalThis.navigator?.geolocation,
  secure = globalThis.isSecureContext,
  now = Date.now,
} = {}) {
  if (!secure)
    throw new Error(
      'Location access needs a secure connection. Open the HTTPS website and try again.',
    );
  if (!geolocation?.getCurrentPosition)
    throw new Error(
      'This browser cannot provide a location. Use a device with location services enabled.',
    );
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timedOut = () =>
      finish(
        reject,
        new Error(
          'Location took too long. Enable location services, move to a clearer area and try again.',
        ),
      );
    const timer = setTimeout(timedOut, 25000);
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position?.coords || {};
          const timestamp = position?.timestamp;
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180 ||
            !Number.isFinite(accuracy) ||
            accuracy < 0 ||
            !Number.isFinite(timestamp) ||
            timestamp < now() - 120000 ||
            timestamp > now() + 30000
          ) {
            finish(
              reject,
              new Error(
                'A fresh location could not be determined. Enable precise location and try again.',
              ),
            );
            return;
          }
          finish(resolve, {
            latitude,
            longitude,
            accuracy_meters: accuracy,
            captured_at: new Date(timestamp).toISOString(),
          });
        },
        (error) => {
          const messages = {
            1: 'Location permission was denied. Allow location access for this website, then try again.',
            2: 'Your location is unavailable. Enable location services and try again.',
            3: 'Location took too long. Enable location services, move to a clearer area and try again.',
          };
          finish(
            reject,
            new Error(
              Object.hasOwn(messages, error?.code)
                ? messages[error.code]
                : 'Your location could not be determined. Enable location services and try again.',
            ),
          );
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    } catch {
      finish(
        reject,
        new Error(
          'Your location could not be determined. Check this browser’s location settings and try again.',
        ),
      );
    }
  });
}

export async function captureAttendanceLocation(options) {
  return {
    ...(await captureDeviceLocation(options)),
    consent_version: LOCATION_NOTICE_VERSION,
  };
}
