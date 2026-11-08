import { API_BASE_URL } from '@/constants/api';

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type AdminDrivingRoute = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

export async function loadAdminDrivingRoute(
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<AdminDrivingRoute> {
  const query = new URLSearchParams({
    originLatitude: String(origin.latitude),
    originLongitude: String(origin.longitude),
    destinationLatitude: String(destination.latitude),
    destinationLongitude: String(destination.longitude),
  });

  const response = await fetch(
    `${API_BASE_URL}/routing/driving?${query.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        'Could not calculate the road route.',
    );
  }

  if (
    !Array.isArray(data?.coordinates) ||
    data.coordinates.length < 2
  ) {
    throw new Error(
      'The backend returned invalid route geometry.',
    );
  }

  const coordinates =
    data.coordinates.filter(
      (
        coordinate: unknown,
      ): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    );

  if (coordinates.length < 2) {
    throw new Error(
      'The backend returned no usable road coordinates.',
    );
  }

  return {
    distanceMeters: Number(
      data.distanceMeters,
    ),
    durationSeconds: Number(
      data.durationSeconds,
    ),
    coordinates,
  };
}
