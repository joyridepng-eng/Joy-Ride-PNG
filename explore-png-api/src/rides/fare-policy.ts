export const JOY_RIDE_FARE_POLICY_VERSION =
  'POM_CITY_FIXED_WHOLE_KM_BANDS_2026_02';

export const ICCC_2026_FLAG_FALL = 4.5;
export const ICCC_2026_DISTANCE_RATE_PER_KM = 5.9;

export type FareBand = {
  maximumDistanceKm: number | null;
  fare: number;
};

export type FareQuote = {
  policyVersion: string;
  distanceMeters: number;
  distanceKm: number;
  bandFare: number;
  legalMaximumFare: number;
  fare: number;
  legalCapApplied: boolean;
};

export const JOY_RIDE_FARE_BANDS: readonly FareBand[] = [
  { maximumDistanceKm: 1, fare: 5 },
  { maximumDistanceKm: 3, fare: 10 },
  { maximumDistanceKm: 5, fare: 15 },
  { maximumDistanceKm: 7, fare: 20 },
  { maximumDistanceKm: 9, fare: 25 },
  { maximumDistanceKm: 10, fare: 30 },
  { maximumDistanceKm: 12, fare: 35 },
  { maximumDistanceKm: 14, fare: 40 },
  { maximumDistanceKm: 16, fare: 45 },
  { maximumDistanceKm: 18, fare: 50 },
  { maximumDistanceKm: 20, fare: 55 },
  { maximumDistanceKm: 22, fare: 60 },
  { maximumDistanceKm: 24, fare: 65 },
  { maximumDistanceKm: 26, fare: 70 },
  { maximumDistanceKm: 28, fare: 75 },
  { maximumDistanceKm: 30, fare: 80 },
  { maximumDistanceKm: 32, fare: 85 },
  { maximumDistanceKm: 34, fare: 90 },
  { maximumDistanceKm: 36, fare: 95 },
  { maximumDistanceKm: 37, fare: 100 },
  { maximumDistanceKm: null, fare: 200 },
];

function floorToCurrency(value: number): number {
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

export function calculateIcccMaximumFare(distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;

  return floorToCurrency(
    ICCC_2026_FLAG_FALL + ICCC_2026_DISTANCE_RATE_PER_KM * distanceKm,
  );
}

export function calculateJoyRideFare(distanceMeters: number): FareQuote {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new RangeError('Driving distance must be a positive finite number');
  }

  const distanceKm = distanceMeters / 1000;
  const chargedDistanceKm = Math.ceil(distanceKm);

  const matchingBand = JOY_RIDE_FARE_BANDS.find(
    (band) =>
      band.maximumDistanceKm === null ||
      chargedDistanceKm <= band.maximumDistanceKm,
  );

  if (!matchingBand) {
    throw new RangeError(
      'No Joy Ride fare band is configured for this distance',
    );
  }

  const legalMaximumFare = calculateIcccMaximumFare(distanceMeters);
  const fare = Math.min(matchingBand.fare, legalMaximumFare);

  return {
    policyVersion: JOY_RIDE_FARE_POLICY_VERSION,
    distanceMeters: Math.round(distanceMeters),
    distanceKm: Number(distanceKm.toFixed(2)),
    bandFare: matchingBand.fare,
    legalMaximumFare,
    fare,
    legalCapApplied: fare < matchingBand.fare,
  };
}
