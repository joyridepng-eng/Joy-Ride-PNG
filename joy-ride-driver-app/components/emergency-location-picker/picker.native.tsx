import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import {
  createIncidentPlaceSearch,
  IncidentSearchPermissionDenied,
  type PlacePoint,
} from "@/services/incident-place-search";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafetyButton, s } from "@/components/driver-safety-ui";
import {
  incidentLocationText,
  selectedIncidentPoint,
} from "@/services/emergency-map-core";
import type { Position } from "@/services/driver-safety-core";
import type { EmergencyLocationPickerProps } from "./types";

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
      <Text style={s.warning}>
        Map unavailable. You can still send the alert without location.
      </Text>
    ) : (
      this.props.children
    );
  }
}
export default function EmergencyLocationPicker(
  props: EmergencyLocationPickerProps,
) {
  return (
    <MapBoundary>
      <Picker {...props} />
    </MapBoundary>
  );
}
function Picker({
  position,
  gps,
  disabled,
  onSelect,
  onInteraction,
}: EmergencyLocationPickerProps) {
  const map = useRef<MapView>(null);
  const [candidate, setCandidate] = useState<Position>();
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlacePoint[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const mounted = useRef(false);
  const epoch = useRef(0);
  const blocked = useRef(disabled || !onSelect);
  blocked.current = disabled || !onSelect;
  const search = useRef(
    createIncidentPlaceSearch(async (address) => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new IncidentSearchPermissionDenied();
      if (
        !mounted.current ||
        blocked.current ||
        AppState.currentState !== "active"
      )
        throw new Error("Search inactive");
      return Location.geocodeAsync(address);
    }),
  ).current;
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        epoch.current++;
        search.cancel();
        setSearching(false);
        setResults([]);
      }
    });
    return () => {
      mounted.current = false;
      search.cancel();
      sub.remove();
    };
  }, [search]);
  useEffect(() => {
    if (disabled || !onSelect) {
      epoch.current++;
      search.cancel();
      setSearching(false);
      setResults([]);
      setCandidate(undefined);
    }
  }, [disabled, onSelect, search]);
  function invalidateSearch() {
    epoch.current++;
    search.cancel();
    setSearching(false);
    setResults([]);
    setSearchMessage("");
  }
  async function findPlace() {
    if (blocked.current || AppState.currentState !== "active") return;
    onInteraction?.();
    const ticket = ++epoch.current;
    setCandidate(undefined);
    setResults([]);
    setSearchMessage("");
    setSearching(true);
    const outcome = await search.search(query);
    if (!mounted.current || ticket !== epoch.current || blocked.current) return;
    setSearching(false);
    if (outcome.kind === "results") {
      setResults(outcome.points);
      setSearchMessage(
        "Choose a suggested point, adjust the map pin if needed, then attach it. Search does not establish your current GPS location.",
      );
    } else {
      const messages = {
        invalid:
          "Enter 3 to 160 characters: a place, landmark or address with town/province.",
        busy: "The previous search is still finishing. You can select a pin manually now.",
        cancelled: "Search cancelled. You can select a pin manually.",
        timeout:
          "Search took too long. You can select a pin manually or send without location.",
        denied:
          "Android place search needs foreground location permission. You can still select a pin manually or send without location.",
        failed:
          "Place search unavailable. Try a fuller address or select a pin manually.",
        empty:
          "No matching point found. Try a fuller address or select a pin manually.",
      };
      setSearchMessage(messages[outcome.kind]);
    }
  }
  const centre = position ?? gps;
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, []);
  function recenter(point: PlacePoint) {
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
      {onSelect && (
        <View style={styles.search}>
          <Text style={s.text}>Find incident location</Text>
          <Text style={s.text}>
            Enter a landmark or address, including town/province. Search
            suggests a point; you must confirm the incident pin. Android may ask
            for foreground location permission.
          </Text>
          <TextInput
            style={s.input}
            accessibilityLabel="Incident place, landmark or address"
            placeholder="Place or address, town, province"
            placeholderTextColor="#64748b"
            value={query}
            maxLength={160}
            editable={!disabled}
            onChangeText={(text) => {
              invalidateSearch();
              setCandidate(undefined);
              setQuery(text);
            }}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (!searching) void findPlace();
            }}
          />
          <SafetyButton
            title={
              searching
                ? "Searching for location..."
                : "Search incident location"
            }
            disabled={disabled || searching}
            onPress={() => {
              void findPlace();
            }}
          />
          {searchMessage ? <Text style={s.text}>{searchMessage}</Text> : null}
          {results.map((point, index) => (
            <SafetyButton
              key={`${point.latitude}:${point.longitude}`}
              title={`Select suggested point ${index + 1}: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}
              disabled={disabled || !ready}
              onPress={() => {
                onInteraction?.();
                invalidateSearch();
                setCandidate(selectedIncidentPoint(point));
                recenter(point);
              }}
            />
          ))}
        </View>
      )}
      <Text style={s.text}>
        {onSelect
          ? "Tap the map, then attach the selected incident pin. Moving the map alone does not attach a location."
          : "Saved incident point. Retries keep this point unchanged."}
      </Text>
      <Text style={s.text}>
        Red: attached incident. Orange: candidate, not yet attached. Blue:
        optional device GPS snapshot.
      </Text>
      {gps && (
        <Text style={s.text}>Blue marker: {incidentLocationText(gps)}</Text>
      )}
      {!centre && (
        <Text style={s.text}>
          Map viewing centre only. No incident point is attached.
        </Text>
      )}
      {slow && !ready && (
        <Text style={s.warning}>
          Map is still loading. Do not wait for it to send an alert without
          location.
        </Text>
      )}
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: centre?.latitude ?? -9.4438,
          longitude: centre?.longitude ?? 147.1803,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => setReady(true)}
        onPress={(event: {
          nativeEvent: { coordinate: { latitude: number; longitude: number } };
        }) => {
          if (!onSelect || disabled) return;
          onInteraction?.();
          invalidateSearch();
          setCandidate(selectedIncidentPoint(event.nativeEvent.coordinate));
        }}
      >
        {gps && (
          <Marker
            coordinate={gps}
            pinColor="#2563eb"
            title="Device GPS snapshot"
            description="Reported device location; not continuous tracking"
          />
        )}
        {gps?.source === "GPS" &&
          gps.accuracyMeters !== undefined &&
          gps.accuracyMeters > 0 && (
            <Circle
              center={gps}
              radius={gps.accuracyMeters}
              strokeColor="#2563eb"
              fillColor="rgba(37,99,235,0.12)"
            />
          )}
        {position && (
          <Marker
            coordinate={position}
            pinColor="#dc2626"
            title={
              position.source === "MANUAL_PIN"
                ? "Attached incident pin"
                : "Attached incident location"
            }
          />
        )}
        {candidate && (
          <Marker
            coordinate={candidate}
            pinColor="#f59e0b"
            title="Candidate only"
            description="Use Attach selected incident pin to confirm"
          />
        )}
      </MapView>
      {candidate && onSelect && (
        <>
          <Text style={s.text}>
            Candidate: {candidate.latitude.toFixed(6)},{" "}
            {candidate.longitude.toFixed(6)}
          </Text>
          <SafetyButton
            title="Attach selected incident pin"
            disabled={disabled}
            onPress={() => {
              const selected = selectedIncidentPoint(candidate);
              if (selected) {
                invalidateSearch();
                onSelect(selected);
                setCandidate(undefined);
              }
            }}
          />
          <SafetyButton
            title="Discard candidate pin"
            disabled={disabled}
            onPress={() => {
              invalidateSearch();
              setCandidate(undefined);
            }}
          />
        </>
      )}
      {position && (
        <SafetyButton
          title="Centre on attached incident"
          disabled={!ready}
          onPress={() => recenter(position)}
        />
      )}
      {gps && (
        <SafetyButton
          title="Centre on GPS snapshot"
          disabled={!ready}
          onPress={() => recenter(gps)}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 10 },
  search: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
  },
  map: { height: 300, width: "100%" },
});
