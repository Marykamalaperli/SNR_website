const hosts = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
  'maps.apple.com',
  'www.openstreetmap.org',
  'openstreetmap.org',
]);
export function checkedMapUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Paste a valid map link with the store’s location.');
  }
  if (
    value.length > 4096 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.has(url.hostname) ||
    (['google.com', 'www.google.com'].includes(url.hostname) &&
      !url.pathname.startsWith('/maps')) ||
    (url.hostname === 'goo.gl' && !url.pathname.startsWith('/maps/'))
  )
    throw new Error('Use an HTTPS Google Maps, Apple Maps or OpenStreetMap link.');
  return url;
}
export function parseStoreMapLink(value) {
  const url = checkedMapUrl(value);
  const text = decodeURIComponent(url.pathname + url.search + url.hash);
  const number = '(-?\\d+(?:\\.\\d+)?)';
  let pair = text.match(new RegExp('!3d' + number + '!4d' + number));
  let source = 'pin';
  if (!pair) {
    for (const key of ['query', 'q', 'll', 'destination']) {
      const candidate = url.searchParams.get(key) || '';
      const found = candidate.match(
        new RegExp('^(?:loc:)?' + number + '\\s*,\\s*' + number + '(?:\\s*\\([^)]*\\))?\\s*$'),
      );
      if (found) {
        pair = found;
        break;
      }
    }
  }
  if (!pair && url.searchParams.has('mlat') && url.searchParams.has('mlon'))
    pair = ['', url.searchParams.get('mlat'), url.searchParams.get('mlon')];
  if (!pair) {
    pair =
      text.match(new RegExp('@' + number + ',' + number + '(?:,|$)')) ||
      url.hash.match(new RegExp('map=\\d+/' + number + '/' + number));
    if (pair) source = 'map centre';
  }
  if (!pair) return null;
  const latitude = Number(pair[1]),
    longitude = Number(pair[2]);
  if (
    !String(pair[1]).trim() ||
    !String(pair[2]).trim() ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new Error('This map link contains invalid coordinates.');
  return { latitude, longitude, source, map_url: url.href };
}
