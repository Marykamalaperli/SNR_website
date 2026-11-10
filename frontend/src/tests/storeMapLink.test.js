import { expect, it } from 'vitest';
import { checkedMapUrl, parseStoreMapLink } from '../services/storeMapLink';

it.each([
  ['https://www.google.com/maps?q=12.971599,77.594566', 12.971599, 77.594566],
  ['https://www.google.com/maps/search/?api=1&query=-12.5%2C77.5', -12.5, 77.5],
  [
    'https://www.google.com/maps/place/store/@13,78,15z/data=!3d12.971599!4d77.594566',
    12.971599,
    77.594566,
  ],
  ['https://maps.apple.com/?ll=12.971599,77.594566', 12.971599, 77.594566],
  ['https://www.openstreetmap.org/?mlat=0&mlon=0', 0, 0],
])(
  'extracts store pins from %s without confusing the viewport with the place',
  (link, latitude, longitude) => {
    expect(parseStoreMapLink(link)).toMatchObject({ latitude, longitude });
  },
);
it('leaves short links unresolved and rejects unsupported hosts, credentials and invalid positions', () => {
  expect(parseStoreMapLink('https://maps.app.goo.gl/fixture')).toBeNull();
  for (const link of [
    'https://google.com.evil.invalid/maps?q=12,77',
    'https://user:pass@www.google.com/maps?q=12,77',
    'http://maps.google.com/?q=12,77',
    'https://127.0.0.1/?q=12,77',
    'https://www.google.com:444/maps?q=12,77',
  ])
    expect(() => checkedMapUrl(link)).toThrow();
  expect(() => parseStoreMapLink('https://maps.google.com/?q=91,77')).toThrow(
    'invalid coordinates',
  );
  expect(() => parseStoreMapLink('https://www.openstreetmap.org/?mlat=&mlon=77')).toThrow(
    'invalid coordinates',
  );
});
