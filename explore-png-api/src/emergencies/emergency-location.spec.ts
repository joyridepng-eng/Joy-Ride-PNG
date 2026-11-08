import { normalizeEmergencyLocation } from './emergency-location';

const time = '2026-10-02T10:00:00.000Z';
const now = Date.parse(time);
const point = {
  latitude: -9.4438,
  longitude: 147.1803,
  recordedAt: time,
  accuracyMeters: 12,
};
describe('Emergency location provenance', () => {
  it('retains Driver-reported GPS coordinates, capture time and accuracy', () => {
    expect(
      normalizeEmergencyLocation({ ...point, source: 'GPS' }, now),
    ).toEqual({
      latitude: point.latitude,
      longitude: point.longitude,
      locationRecordedAt: new Date(time),
      accuracyMeters: 12,
      locationSource: 'GPS',
    });
  });
  it('retains a manually selected point but never assigns measured GPS accuracy to it', () => {
    const result = normalizeEmergencyLocation(
      { ...point, source: 'MANUAL_PIN' },
      now,
    );
    expect(result.locationSource).toBe('MANUAL_PIN');
    expect(result.accuracyMeters).toBeNull();
    expect(result.latitude).toBe(point.latitude);
    expect(result.locationRecordedAt).toEqual(new Date(time));
  });
  it('keeps legacy provenance unknown instead of inventing GPS or manual origin', () => {
    expect(normalizeEmergencyLocation(point, now).locationSource).toBeNull();
    expect(
      normalizeEmergencyLocation({ ...point, source: 'unexpected' }, now)
        .locationSource,
    ).toBeNull();
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { ...point, latitude: 91 },
    { ...point, longitude: NaN },
    { ...point, recordedAt: 'invalid' },
    { ...point, recordedAt: new Date(now + 60_001).toISOString() },
  ])('discards invalid optional location without throwing', (value) => {
    expect(normalizeEmergencyLocation(value, now)).toEqual({
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      locationRecordedAt: null,
      locationSource: null,
    });
  });
  it('does not invent a zero coordinate or current timestamp when GPS is absent', () => {
    expect(
      normalizeEmergencyLocation({ source: 'GPS' }, now).latitude,
    ).toBeNull();
    expect(
      normalizeEmergencyLocation({ ...point, accuracyMeters: -1 }, now)
        .accuracyMeters,
    ).toBeNull();
  });
});
