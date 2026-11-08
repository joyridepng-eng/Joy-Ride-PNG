import LiveVehicleMarker from "@/components/live-vehicle-marker";
import type { AdminActiveRide } from '@/services/admin-active-rides';
import type { AdminDrivingRoute } from '@/services/admin-driving-route';
import type { FleetDriverLocation } from '@/services/fleet-locations';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';

import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

type FleetMapProps = {
  locations: FleetDriverLocation[];
  selectedDriverId: string | null;
  selectedRide: AdminActiveRide | null;
  route: AdminDrivingRoute | null;
  onSelectDriver: (driverId: string) => void;
};

export type FleetMapHandle = {
  showFleet: () => void;
  recenterSelectedDriver: () => void;
  fitSelectedTrip: () => void;
};

const PORT_MORESBY_REGION = {
  latitude: -9.4438,
  longitude: 147.1803,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function isStale(recordedAt: string) {
  const timestamp =
    new Date(recordedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > 60_000;
}

function hasPoorAccuracy(
  accuracy: number | null,
) {
  return (
    accuracy !== null &&
    Number.isFinite(accuracy) &&
    accuracy > 50
  );
}

function validCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

const FleetMap = forwardRef<
  FleetMapHandle,
  FleetMapProps
>(function FleetMap(
  {
    locations,
    selectedDriverId,
    selectedRide,
    route,
    onSelectDriver,
  },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);

  const selectedLocation =
    locations.find(
      (item) =>
        item.driverId === selectedDriverId,
    ) ?? null;

  const showPickup =
    selectedRide &&
    validCoordinate(
      selectedRide.pickupLatitude,
      selectedRide.pickupLongitude,
    );

  const showDropoff =
    selectedRide &&
    validCoordinate(
      selectedRide.dropoffLatitude,
      selectedRide.dropoffLongitude,
    );

  useImperativeHandle(
    ref,
    () => ({
      showFleet() {
        if (locations.length === 0) {
          mapRef.current?.animateToRegion(
            PORT_MORESBY_REGION,
            500,
          );
          return;
        }

        mapRef.current?.fitToCoordinates(
          locations.map((location) => ({
            latitude: location.latitude,
            longitude: location.longitude,
          })),
          {
            edgePadding: {
              top: 90,
              right: 70,
              bottom: 90,
              left: 70,
            },
            animated: true,
          },
        );
      },

      recenterSelectedDriver() {
        if (!selectedLocation) {
          return;
        }

        mapRef.current?.animateToRegion(
          {
            latitude:
              selectedLocation.latitude,
            longitude:
              selectedLocation.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          500,
        );
      },

      fitSelectedTrip() {
        if (!selectedLocation) {
          return;
        }

        const coordinates = [
          {
            latitude:
              selectedLocation.latitude,
            longitude:
              selectedLocation.longitude,
          },
        ];

        if (
          showPickup &&
          selectedRide
        ) {
          coordinates.push({
            latitude:
              selectedRide.pickupLatitude!,
            longitude:
              selectedRide.pickupLongitude!,
          });
        }

        if (
          showDropoff &&
          selectedRide
        ) {
          coordinates.push({
            latitude:
              selectedRide.dropoffLatitude!,
            longitude:
              selectedRide.dropoffLongitude!,
          });
        }

        if (
          route &&
          route.coordinates.length >= 2
        ) {
          coordinates.push(
            ...route.coordinates.map(
              ([longitude, latitude]) => ({
                latitude,
                longitude,
              }),
            ),
          );
        }

        mapRef.current?.fitToCoordinates(
          coordinates,
          {
            edgePadding: {
              top: 90,
              right: 70,
              bottom: 90,
              left: 70,
            },
            animated: true,
          },
        );
      },
    }),
    [
      locations,
      route,
      selectedLocation,
      selectedRide,
      showDropoff,
      showPickup,
    ],
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={PORT_MORESBY_REGION}
        mapType="standard"
        showsCompass
        showsBuildings
        toolbarEnabled={false}
      >
        {route &&
        route.coordinates.length >= 2 ? (
          <Polyline
            coordinates={route.coordinates.map(
              ([longitude, latitude]) => ({
                latitude,
                longitude,
              }),
            )}
            strokeWidth={5}
            strokeColor="#2563eb"
          />
        ) : null}

        {locations.map((location) => {
          const stale =
            isStale(location.recordedAt);

          const poorAccuracy =
            hasPoorAccuracy(
              location.accuracy,
            );

          const selected =
            selectedDriverId ===
            location.driverId;

          const status =
            !location.driver.isOnline
              ? 'OFFLINE'
              : location.driver.isAvailable
                ? 'AVAILABLE'
                : 'BUSY';

          return (
            <LiveVehicleMarker
              key={location.driverId}
              coordinate={{
                latitude:
                  location.latitude,
                longitude:
                  location.longitude,
              }}
              rotation={
                Number.isFinite(
                  location.heading,
                )
                  ? location.heading ?? 0
                  : 0
              }
              flat
              anchor={{
                x: 0.5,
                y: 0.5,
              }}
              onPress={() =>
                onSelectDriver(
                  location.driverId,
                )
              }
            >
              <View
                style={[
                  styles.vehicleMarker,
                  stale
                    ? styles.staleMarker
                    : location.driver
                          .isAvailable
                      ? styles.availableMarker
                      : styles.busyMarker,
                  selected
                    ? styles.selectedMarker
                    : null,
                ]}
              >
                <Text
                  style={
                    styles.vehicleIcon
                  }
                >
                  {'\u{1F697}'}
                </Text>
              </View>

              <View
                style={[
                  styles.driverCard,
                  selected
                    ? styles.selectedCard
                    : null,
                ]}
              >
                <Text
                  style={styles.driverName}
                  numberOfLines={1}
                >
                  {
                    location.driver
                      .fullName
                  }
                </Text>

                <Text
                  style={
                    styles.driverStatus
                  }
                >
                  {status}
                </Text>

                {poorAccuracy ? (
                  <Text
                    style={
                      styles.warningText
                    }
                  >
                    GPS {'\u00B1'}
                    {Math.round(
                      location.accuracy ??
                        0,
                    )}
                    m
                  </Text>
                ) : null}

                {stale ? (
                  <Text
                    style={
                      styles.warningText
                    }
                  >
                    STALE GPS
                  </Text>
                ) : null}
              </View>
            </LiveVehicleMarker>
          );
        })}

        {showPickup &&
        selectedRide ? (
          <Marker
            coordinate={{
              latitude:
                selectedRide.pickupLatitude!,
              longitude:
                selectedRide.pickupLongitude!,
            }}
            pinColor="#16a34a"
            title="PICKUP"
            description={
              selectedRide.pickupAddress ||
              selectedRide.pickupLabel ||
              'Pickup location'
            }
          />
        ) : null}

        {showDropoff &&
        selectedRide ? (
          <Marker
            coordinate={{
              latitude:
                selectedRide.dropoffLatitude!,
              longitude:
                selectedRide.dropoffLongitude!,
            }}
            pinColor="#dc2626"
            title="DROP-OFF"
            description={
              selectedRide.dropoffAddress ||
              selectedRide.dropoffLabel ||
              'Drop-off location'
            }
          />
        ) : null}
      </MapView>
    </View>
  );
});

export default FleetMap;

const styles = StyleSheet.create({
  container: {
    height: 500,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  vehicleMarker: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },

  availableMarker: {
    backgroundColor: '#16a34a',
  },

  busyMarker: {
    backgroundColor: '#2563eb',
  },

  staleMarker: {
    backgroundColor: '#64748b',
  },

  selectedMarker: {
    borderWidth: 5,
    borderColor: '#facc15',
  },

  vehicleIcon: {
    fontSize: 25,
  },

  driverCard: {
    minWidth: 120,
    maxWidth: 180,
    backgroundColor:
      'rgba(255,255,255,0.96)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 4,
  },

  selectedCard: {
    borderWidth: 2,
    borderColor: '#facc15',
  },

  driverName: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },

  driverStatus: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },

  warningText: {
    color: '#b45309',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 2,
  },
});
