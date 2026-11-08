import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
};

type OsrmResponse = {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
};

export type DrivingRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

@Injectable()
export class RoutingService {
  private readonly osrmBaseUrl = 'https://router.project-osrm.org';

  async getDrivingRoute(
    originLatitude: number,
    originLongitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
  ): Promise<DrivingRouteResult> {
    const coordinates =
      `${originLongitude},${originLatitude};` +
      `${destinationLongitude},${destinationLatitude}`;

    const url =
      `${this.osrmBaseUrl}/route/v1/driving/${coordinates}` +
      '?alternatives=false' +
      '&steps=false' +
      '&geometries=geojson' +
      '&overview=full';

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Joy-Ride-Development/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException(
          `Routing provider returned HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OsrmResponse;

      if (data.code === 'NoRoute' || !data.routes || data.routes.length === 0) {
        throw new NotFoundException(
          'No driving route could be found between these locations',
        );
      }

      if (data.code !== 'Ok') {
        throw new BadGatewayException(
          data.message || `Routing provider returned ${data.code}`,
        );
      }

      const route = data.routes[0];

      const routeCoordinates = route.geometry.coordinates
        .filter(
          (coordinate) =>
            Array.isArray(coordinate) &&
            coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1]),
        )
        .map(
          (coordinate) => [coordinate[0], coordinate[1]] as [number, number],
        );

      if (routeCoordinates.length < 2) {
        throw new BadGatewayException(
          'Routing provider returned invalid route geometry',
        );
      }

      return {
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        coordinates: routeCoordinates,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new RequestTimeoutException(
          'The routing provider took too long to respond',
        );
      }

      throw new BadGatewayException(
        'The routing provider could not be reached',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
