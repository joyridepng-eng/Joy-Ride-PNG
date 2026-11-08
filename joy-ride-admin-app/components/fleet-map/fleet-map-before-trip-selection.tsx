import { FleetDriverLocation } from '@/services/fleet-locations';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

type FleetMapProps = {
  locations: FleetDriverLocation[];
};

const PORT_MORESBY_REGION = {
  latitude: -9.4438,
  longitude: 147.1803,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function isStale(recordedAt: string) {
  const timestamp = new Date(recordedAt).getTime();

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

export default function FleetMap({
  locations,
}: FleetMapProps) {
  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={PORT_MORESBY_REGION}
        mapType="standard"
        showsCompass
        showsBuildings
        toolbarEnabled={false}
      >
        {locations.map((location) => {
          const stale = isStale(
            location.recordedAt,
          );

          const poorAccuracy =
            hasPoorAccuracy(location.accuracy);

          const status = !location.driver.isOnline
            ? 'OFFLINE'
            : location.driver.isAvailable
              ? 'AVAILABLE'
              : 'BUSY';

          return (
            <Marker
              key={location.driverId}
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              rotation={
                Number.isFinite(location.heading)
                  ? location.heading ?? 0
                  : 0
              }
              flat
              anchor={{
                x: 0.5,
                y: 0.5,
              }}
              title={location.driver.fullName}
              description={`${status} • Accuracy ${
                location.accuracy ?? 'unknown'
              }m`}
            >
              <View
                style={[
                  styles.vehicleMarker,
                  stale
                    ? styles.staleMarker
                    : location.driver.isAvailable
                      ? styles.availableMarker
                      : styles.busyMarker,
                ]}
              >
                <Text style={styles.vehicleIcon}>
                  🚗
                </Text>
              </View>

              <View style={styles.driverCard}>
                <Text
                  style={styles.driverName}
                  numberOfLines={1}
                >
                  {location.driver.fullName}
                </Text>

                <Text style={styles.driverStatus}>
                  {status}
                </Text>

                {poorAccuracy ? (
                  <Text style={styles.warningText}>
                    GPS ±{Math.round(
                      location.accuracy ?? 0,
                    )}m
                  </Text>
                ) : null}

                {stale ? (
                  <Text style={styles.warningText}>
                    STALE GPS
                  </Text>
                ) : null}
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

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

  vehicleIcon: {
    fontSize: 25,
  },

  driverCard: {
    minWidth: 120,
    maxWidth: 180,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 4,
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
