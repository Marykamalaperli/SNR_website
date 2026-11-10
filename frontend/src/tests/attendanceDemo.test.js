import { expect, it } from 'vitest';
import {
  checkDemoEvidence,
  DEMO_QR,
  distanceMeters,
  INITIAL_SITE,
  samplePoint,
} from '../../attendance-demo/model';

it('keeps a matching point inside the area and rejects outside, uncertain and wrong-QR samples', () => {
  expect(checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'inside'), DEMO_QR)).toBe(0);
  expect(() =>
    checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'outside'), DEMO_QR),
  ).toThrow('Outside');
  expect(() =>
    checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'inaccurate'), DEMO_QR),
  ).toThrow('accuracy');
  expect(() =>
    checkDemoEvidence(INITIAL_SITE, samplePoint(INITIAL_SITE, 'inside'), 'wrong'),
  ).toThrow('QR');
  expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
    111194.93,
    1,
  );
});
