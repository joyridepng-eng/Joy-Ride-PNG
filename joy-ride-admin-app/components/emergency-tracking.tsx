import { useCallback } from "react";
import { Text, View } from "react-native";
import { adminSafety, type Emergency } from "@/services/admin-safety";
import {
  incidentPoint,
  incidentVehicleLabel,
  pointDescription,
  samePoint,
} from "@/services/emergency-map-core";
import { useSafetyLoad } from "@/hooks/use-safety-request";
import {
  SafetyButton,
  SafetyNotice,
  s,
  safetyTime,
} from "@/components/safety-ui";
import EmergencyMap from "@/components/emergency-map";

export default function EmergencyTracking({
  item,
  detailError,
}: {
  item: Emergency;
  detailError: boolean;
}) {
  const enabled = item.status !== "RESOLVED" && !detailError;
  const load = useCallback(
    (signal: AbortSignal) =>
      enabled
        ? adminSafety.latestDriverLocation(item.driver.id, signal)
        : Promise.resolve(null),
    [enabled, item.driver.id],
  );
  const latest = useSafetyLoad(load, enabled ? 15000 : 0);
  const incident = incidentPoint(item);
  const gps = enabled ? latest.data : null;
  return (
    <View style={s.card}>
      <Text style={s.heading}>Emergency vehicle map</Text>
      <Text style={s.text}>Driver: {item.driver.fullName}</Text>
      <Text style={s.text}>{incidentVehicleLabel(item)}</Text>
      <Text style={s.text}>
        Red car: saved incident. Blue or grey car: latest reported Driver GPS.
        They are separate points; the latest GPS never moves the saved incident.
      </Text>
      <Text selectable style={s.text}>
        {incident
          ? pointDescription(incident)
          : "No incident location supplied. Contact the Driver; a fleet point does not establish where the incident occurred."}
      </Text>
      {gps && (
        <>
          <Text selectable style={s.text}>
            {pointDescription(gps)}
          </Text>
          <Text style={s.muted}>
            Driver online flag:{" "}
            {gps.driverOnline === null
              ? "Unknown"
              : gps.driverOnline
                ? "Online"
                : "Offline; this may be a last known point"}
            .
          </Text>
          {gps.accuracyMeters !== null && gps.accuracyMeters > 50 && (
            <SafetyNotice
              error
              text="GPS accuracy is broad. The marker is an estimate; confirm the location with the Driver."
            />
          )}
        </>
      )}
      {enabled && latest.checkedAt && (
        <Text style={s.muted}>
          Latest successful GPS server check:{" "}
          {safetyTime(new Date(latest.checkedAt).toISOString())}
        </Text>
      )}
      {latest.error && (
        <SafetyNotice
          error
          text="GPS refresh failed. Any displayed GPS is from the last successful check and may be out of date. Incident coordinates and Admin response controls remain available."
        />
      )}
      {enabled && latest.busy && (
        <Text style={s.muted}>Checking latest Driver GPS...</Text>
      )}
      {enabled && latest.checkedAt && !gps && !latest.error && (
        <Text style={s.text}>
          No GPS report found for this Driver. No location has been invented.
        </Text>
      )}
      <Text style={s.muted}>
        {enabled
          ? "GPS is checked every 15 seconds while this screen is visible and active. It may stop when the Driver is offline; there is no guaranteed continuous tracking."
          : item.status === "RESOLVED"
            ? "Alert resolved. Latest-GPS polling stopped; the saved incident remains available."
            : "Latest-GPS polling paused until a successful alert status refresh."}
      </Text>
      {samePoint(incident, gps) && (
        <Text style={s.muted}>
          Both points share the same coordinates, so their map markers overlap.
          Their source and time labels above remain separate.
        </Text>
      )}
      {incident || gps ? (
        <EmergencyMap
          incident={incident}
          latest={gps}
          refreshFailed={!!latest.error}
          vehicleLabel={incidentVehicleLabel(item)}
        />
      ) : (
        <SafetyNotice text="No verified coordinates available to plot. Contact the Driver directly." />
      )}
      <SafetyButton
        title="Refresh latest Driver GPS"
        disabled={!enabled || latest.busy}
        onPress={() => {
          void latest.refresh();
        }}
      />
    </View>
  );
}
