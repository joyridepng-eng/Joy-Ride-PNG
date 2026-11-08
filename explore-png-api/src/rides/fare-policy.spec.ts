import {
  calculateIcccMaximumFare,
  calculateJoyRideFare,
  JOY_RIDE_FARE_POLICY_VERSION,
} from './fare-policy';

describe('Joy Ride fare policy', () => {
  it.each([
    [1000, 5],
    [1001, 10],
    [3000, 10],
    [3001, 15],
    [5000, 15],
    [5001, 20],
    [7000, 20],
    [7001, 25],
    [9000, 25],
    [9001, 30],
    [10000, 30],
    [10001, 35],
    [12000, 35],
    [12001, 40],
    [14000, 40],
    [14001, 45],
    [16000, 45],
    [16001, 50],
    [18000, 50],
    [18001, 55],
    [20000, 55],
    [20001, 60],
    [22000, 60],
    [22001, 65],
    [24000, 65],
    [24001, 70],
    [26000, 70],
    [26001, 75],
    [28000, 75],
    [28001, 80],
    [30000, 80],
    [30001, 85],
    [32000, 85],
    [32001, 90],
    [34000, 90],
    [34001, 95],
    [36000, 95],
    [36001, 100],
    [37000, 100],
    [37001, 200],
    [50000, 200],
  ])(
    'charges the correct fixed fare for %s metres: K%s',
    (distanceMeters, expectedFare) => {
      expect(calculateJoyRideFare(distanceMeters).fare).toBe(expectedFare);
    },
  );

  it.each([
    [1100, 10],
    [2700, 10],
    [3100, 15],
    [8800, 25],
    [9010, 30],
    [14010, 45],
    [36010, 100],
  ])(
    'rounds %s metres upward before selecting the K%s band',
    (distanceMeters, expectedFare) => {
      expect(calculateJoyRideFare(distanceMeters).fare).toBe(expectedFare);
    },
  );

  it('caps a very short trip at the ICCC maximum', () => {
    const quote = calculateJoyRideFare(1);

    expect(quote.bandFare).toBe(5);
    expect(quote.legalMaximumFare).toBe(4.5);
    expect(quote.fare).toBe(4.5);
    expect(quote.legalCapApplied).toBe(true);
  });

  it('calculates the official maximum fare', () => {
    expect(calculateIcccMaximumFare(1000)).toBe(10.4);
  });

  it('returns normalized distance and new policy metadata', () => {
    expect(calculateJoyRideFare(5432.4)).toEqual({
      policyVersion: JOY_RIDE_FARE_POLICY_VERSION,
      distanceMeters: 5432,
      distanceKm: 5.43,
      bandFare: 20,
      legalMaximumFare: 36.55,
      fare: 20,
      legalCapApplied: false,
    });
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid driving distance %s', (distanceMeters) => {
    expect(() => calculateJoyRideFare(distanceMeters)).toThrow(
      'Driving distance must be a positive finite number',
    );
  });
});
