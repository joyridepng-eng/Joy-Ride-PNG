import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafetyButton, SafetyNotice, s } from "@/components/safety-ui";
import { accuracyRadius } from "@/services/emergency-map-core";
import type { EmergencyMapProps } from "./types";
import {
  loadGoogleMaps,
  type GoogleLibraries,
  type GoogleMap,
} from "./google.web";
import { carContent, gpsIsUncertain, mapPosition } from "./web-map-core";

export default function EmergencyMap({
  incident,
  latest,
  refreshFailed,
  vehicleLabel,
}: EmergencyMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<{
    libraries: GoogleLibraries;
    map: GoogleMap;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pointFailed, setPointFailed] = useState(false);
  const initial = useRef(incident ?? latest);
  const fitted = useRef(false);
  useEffect(() => {
    let alive = true;
    let cleanupMap: (() => void) | null = null;
    const authFailed = () => {
      if (alive) setFailed(true);
    };
    window.addEventListener("joyride-maps-auth-failure", authFailed);
    void loadGoogleMaps()
      .then((libraries) => {
        if (!alive || !element.current || !initial.current) return;
        const map = new libraries.Map(element.current, {
          center: mapPosition(initial.current),
          zoom: 16,
          mapId: "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        });
        cleanupMap = () => libraries.clearListeners(map);
        setReady({ libraries, map });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      window.removeEventListener("joyride-maps-auth-failure", authFailed);
      cleanupMap?.();
    };
  }, []);
  useEffect(() => {
    if (!ready || failed) return;
    const markers: { map: GoogleMap | null }[] = [];
    const circles: { setMap: (map: GoogleMap | null) => void }[] = [];
    try {
      const { libraries, map } = ready;
      const points = [];
      if (incident) {
        const position = mapPosition(incident);
        const marker = new libraries.AdvancedMarkerElement({
          map,
          position,
          title: `Saved incident — ${vehicleLabel}`,
          zIndex: 20,
        });
        marker.append(
          carContent(`Saved incident — ${vehicleLabel}`, "#c62828"),
        );
        markers.push(marker);
        points.push(position);
        const radius = accuracyRadius(incident);
        if (radius)
          circles.push(
            new libraries.Circle({
              map,
              center: position,
              radius,
              strokeColor: "#c62828",
              fillColor: "#c62828",
              fillOpacity: 0.12,
              strokeWeight: 1,
            }),
          );
      }
      if (latest) {
        const position = mapPosition(latest);
        const uncertain = gpsIsUncertain(latest, refreshFailed);
        const color = uncertain ? "#616161" : "#1565c0";
        const marker = new libraries.AdvancedMarkerElement({
          map,
          position,
          title: uncertain
            ? "Driver GPS — stale, offline or refresh failed"
            : "Latest reported Driver GPS",
          zIndex: 10,
        });
        marker.append(
          carContent(
            uncertain ? "Driver GPS — uncertain" : "Latest reported Driver GPS",
            color,
          ),
        );
        markers.push(marker);
        points.push(position);
        const radius = accuracyRadius(latest);
        if (radius)
          circles.push(
            new libraries.Circle({
              map,
              center: position,
              radius,
              strokeColor: color,
              fillColor: color,
              fillOpacity: 0.1,
              strokeWeight: 1,
            }),
          );
      }
      if (!fitted.current && points.length) {
        if (
          points.length === 1 ||
          (points[0].lat === points[1].lat && points[0].lng === points[1].lng)
        ) {
          map.panTo(points[0]);
          map.setZoom(16);
        } else {
          const bounds = new libraries.LatLngBounds();
          points.forEach((point) => bounds.extend(point));
          map.fitBounds(bounds, 60);
        }
        fitted.current = true;
      }
      setPointFailed(false);
    } catch {
      setPointFailed(true);
    }
    return () => {
      markers.forEach((marker) => {
        marker.map = null;
      });
      circles.forEach((circle) => circle.setMap(null));
    };
  }, [ready, failed, incident, latest, refreshFailed, vehicleLabel]);
  const centre = (point: typeof incident) => {
    if (!ready || failed || !point) return;
    try {
      ready.map.panTo(mapPosition(point));
      ready.map.setZoom(16);
    } catch {
      setPointFailed(true);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.heading}>Google emergency map — Safety Test</Text>
      {failed ? (
        <SafetyNotice
          error
          text="Google Maps could not load or authorize this browser key. Driver contact details, saved coordinates and Admin response controls remain available. Check the website/API restrictions and billing, then reload the page."
        />
      ) : null}
      {pointFailed ? (
        <SafetyNotice
          error
          text="A map point could not be displayed safely. Use the validated coordinates and contact the Driver."
        />
      ) : null}
      {!ready && !failed ? (
        <Text style={s.muted}>Loading Google Maps...</Text>
      ) : null}
      <div
        ref={element}
        aria-label="Saved incident and latest Driver GPS map"
        style={{
          width: "100%",
          height: 420,
          minHeight: 320,
          borderRadius: 8,
          background: "#edf1f4",
          display: failed ? "none" : "block",
        }}
      />
      <Text style={s.muted}>
        Red car: fixed incident location. Blue car: recent Driver GPS. Grey car:
        uncertain GPS. These markers do not identify a vehicle independently of
        the records above.
      </Text>
      <SafetyButton
        title="Centre on saved incident"
        disabled={!ready || failed || !incident}
        onPress={() => centre(incident)}
      />
      <SafetyButton
        title="Centre on latest Driver GPS"
        disabled={!ready || failed || !latest}
        onPress={() => centre(latest)}
      />
    </View>
  );
}
