import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafetyButton, SafetyNotice, s } from "@/components/safety-ui";
import {
  accuracyRadius,
  pointAge,
  type MapPoint,
} from "@/services/emergency-map-core";
import type { EmergencyMapProps } from "./types";
class MapBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <SafetyNotice
        error
        text="Map unavailable. Use the coordinates above and contact the Driver. Admin response controls remain available."
      />
    ) : (
      this.props.children
    );
  }
}
export default function EmergencyMap(props: EmergencyMapProps) {
  return (
    <MapBoundary>
      <VehicleMap {...props} />
    </MapBoundary>
  );
}
function Car({ color }: { color: string }) {
  return (
    <View style={[styles.car, { backgroundColor: color }]}>
      <Ionicons name="car" size={25} color="#ffffff" />
    </View>
  );
}
function VehicleMap({
  incident,
  latest,
  refreshFailed,
  vehicleLabel,
}: EmergencyMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const centre = incident ?? latest;
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, []);
  if (!centre) return null;
  const gpsColor =
    latest &&
    latest.driverOnline === true &&
    !refreshFailed &&
    !pointAge(latest).stale
      ? "#2563eb"
      : "#64748b";
  const incidentRadius = incident ? accuracyRadius(incident) : null;
  const latestRadius = latest ? accuracyRadius(latest) : null;
  function center(point: MapPoint) {
    map.current?.animateToRegion(
      {
        latitude: point.latitude,
        longitude: point.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      350,
    );
  }
  return (
    <View style={styles.panel}>
      {slow && !ready && (
        <SafetyNotice
          error
          text="Map is still loading. Use the coordinates above; acknowledgement and resolution do not require a map."
        />
      )}
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: centre.latitude,
          longitude: centre.longitude,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => setReady(true)}
      >
        {incident && (
          <Marker
            coordinate={incident}
            zIndex={3}
            title={
              incident.source === "MANUAL_PIN"
                ? "Saved Driver-selected incident pin"
                : "Saved incident location"
            }
            description={vehicleLabel}
          >
            <Car color="#dc2626" />
          </Marker>
        )}
        {latest && (
          <Marker
            coordinate={latest}
            zIndex={2}
            title="Latest Driver-reported GPS"
            description={
              refreshFailed
                ? "Last successful report; refresh failed"
                : pointAge(latest).stale
                  ? "Stale or uncertain position; confirm with Driver"
                  : "Recent GPS report, not guaranteed current position"
            }
          >
            <Car color={gpsColor} />
          </Marker>
        )}
        {incident && incidentRadius !== null && (
          <Circle
            center={incident}
            radius={incidentRadius}
            strokeColor="#dc2626"
            fillColor="rgba(220,38,38,0.10)"
          />
        )}
        {latest && latestRadius !== null && (
          <Circle
            center={latest}
            radius={latestRadius}
            strokeColor={gpsColor}
            fillColor="rgba(37,99,235,0.10)"
          />
        )}
      </MapView>
      <Text style={s.muted}>
        The map does not follow automatically while you inspect it. Use a centre
        button to move to a reported point.
      </Text>
      {incident && (
        <SafetyButton
          title="Centre on saved incident"
          disabled={!ready}
          onPress={() => center(incident)}
        />
      )}
      {latest && (
        <SafetyButton
          title="Centre on latest Driver GPS"
          disabled={!ready}
          onPress={() => center(latest)}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 10 },
  map: { height: 340, width: "100%" },
  car: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
});
