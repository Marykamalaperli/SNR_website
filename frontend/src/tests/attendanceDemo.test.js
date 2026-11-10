import { expect, it } from 'vitest';
import {
  checkDemoEvidence,
  distanceMeters,
  INITIAL_SITE,
  samplePoint,
} from '../../attendance-demo/model';

it('keeps a matching point inside the area and rejects outside and uncertain samples', () => {
  expect(checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'inside'))).toBe(0);
  expect(() => checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'outside'))).toThrow(
    'Outside',
  );
  expect(() => checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'inaccurate'))).toThrow(
    'accuracy',
  );
  expect(() =>
    checkDemoEvidence(
      { ...INITIAL_SITE, radius_meters: 100 },
      {
        latitude: INITIAL_SITE.latitude + 55 / 111194.93,
        longitude: INITIAL_SITE.longitude,
        accuracy_meters: 1,
      },
    ),
  ).toThrow('Outside');
  expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
    111194.93,
    1,
  );
});
