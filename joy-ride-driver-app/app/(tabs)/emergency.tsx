import EmergencyLocationPicker from "@/components/emergency-location-picker";
import { incidentLocationText } from "@/services/emergency-map-core";
import { useDriverAuth } from "@/contexts/driver-auth-context";
import { driverSafety, optionalPosition } from "@/services/driver-safety";
import type { Position } from "@/services/driver-safety-core";
import { useSafetyAction, useSafetyLoad } from "@/hooks/use-driver-safety";
import { AlertStatus, SafetyButton, s } from "@/components/driver-safety-ui";
import { router, type Href, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function EmergencyScreen() {
  const { session } = useDriverAuth();
  return session ? (
    <EmergencyWorkspace key={session.driver.id} driverId={session.driver.id} />
  ) : (
    <Text>Sign in to access Driver safety.</Text>
  );
}
function EmergencyWorkspace({ driverId }: { driverId: string }) {
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState<Position>();
  const [gpsSnapshot, setGpsSnapshot] = useState<Position>();
  const [mapOpen, setMapOpen] = useState(false);
  const [savedMapOpen, setSavedMapOpen] = useState(false);
  const [locationMessage, setLocationMessage] = useState(
    "Location is optional. You can send without it.",
  );
  const [locating, setLocating] = useState(false);
  const [newIncident, setNewIncident] = useState(false);
  const locationEpoch = useRef(0);
  const local = useSafetyLoad(
    useCallback(
      async () => ({ draft: await driverSafety.load(driverId) }),
      [driverId],
    ),
  );
  const history = useSafetyLoad(
    useCallback(
      (signal: AbortSignal) => driverSafety.history(driverId, signal),
      [driverId],
    ),
    15000,
  );
  const action = useSafetyAction();
  const draft = local.data?.draft;
  const savedId = draft?.alertId;
  const detail = useSafetyLoad(
    useCallback(
      (signal: AbortSignal) =>
        savedId
          ? driverSafety.get(driverId, savedId, signal)
          : Promise.resolve(null),
      [driverId, savedId],
    ),
    15000,
  );
  const editable =
    local.data !== null && !local.error && (!draft || newIncident);
  useFocusEffect(
    useCallback(() => {
      setNewIncident(false);
      setMapOpen(false);
      setSavedMapOpen(false);
      setLocating(false);
      const sub = AppState.addEventListener("change", (state) => {
        if (state !== "active") {
          locationEpoch.current++;
          setMapOpen(false);
          setSavedMapOpen(false);
          setLocating(false);
        }
      });
      return () => {
        locationEpoch.current++;
        setMapOpen(false);
        setSavedMapOpen(false);
        sub.remove();
      };
    }, []),
  );
  async function locate() {
    const epoch = ++locationEpoch.current;
    setLocating(true);
    const p = await optionalPosition();
    if (epoch !== locationEpoch.current) return;
    if (p) {
      setPosition(p);
      setGpsSnapshot(p);
    }
    setLocating(false);
    setLocationMessage(
      p
        ? `GPS snapshot recorded at ${new Date(p.recordedAt).toLocaleTimeString()}.`
        : "GPS unavailable or permission not granted. Any attached incident point is unchanged. You can still send without GPS.",
    );
  }
  function confirmSend() {
    Alert.alert(
      "Send emergency alert?",
      "This sends a request to Joy Ride Admin. It does not call emergency services or guarantee immediate assistance.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send alert",
          style: "destructive",
          onPress: () =>
            void action.run(
              async (signal) => {
                if (signal.aborted) return;
                locationEpoch.current++;
                setMapOpen(false);
                setLocating(false);
                try {
                  await driverSafety.prepare(
                    driverId,
                    message,
                    position,
                    newIncident,
                  );
                  if (signal.aborted) return;
                  setNewIncident(false);
                  await driverSafety.send(driverId, signal);
                  if (!signal.aborted) {
                    setMessage("");
                    setPosition(undefined);
                  }
                } finally {
                  await local.refresh();
                }
              },
              () => {
                void history.refresh();
                void detail.refresh();
              },
            ),
        },
      ],
    );
  }
  const current =
    detail.data ??
    (draft
      ? history.data?.find(
          (item) => item.clientRequestId === draft.clientRequestId,
        )
      : undefined);
  return (
    <ScrollView
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>Driver emergency</Text>
      <Text style={s.warning}>
        If there is immediate danger, contact local emergency services or your
        dispatcher directly when safe. This app does not dispatch emergency
        responders.
      </Text>
      <Text style={s.text}>
        Status updates while this screen is open and online. There is no
        background sending, closed-app push alert or guaranteed Admin response.
      </Text>
      <SafetyButton
        title="My Rider ratings"
        onPress={() => router.push("/ratings" as Href)}
      />
      {Platform.OS === "web" && (
        <Text style={s.warning}>
          Use the installed Driver app to send alerts and preserve retries.
        </Text>
      )}
      {!!local.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {local.error}
        </Text>
      )}
      {!local.data && !local.error && (
        <Text style={s.text}>Loading saved alert...</Text>
      )}
      {!!action.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {action.error}
        </Text>
      )}
      {editable && Platform.OS !== "web" && (
        <View style={s.card}>
          <Text style={s.heading}>
            {newIncident ? "Separate new incident" : "New emergency alert"}
          </Text>
          <TextInput
            accessibilityLabel="Optional emergency message, up to 200 characters"
            placeholder="Optional message (200 characters)"
            placeholderTextColor="#64748b"
            multiline
            maxLength={200}
            value={message}
            onChangeText={setMessage}
            editable={!action.busy}
            style={s.input}
          />
          <Text style={s.text}>{locationMessage}</Text>
          <Text selectable style={s.text}>
            {incidentLocationText(position)}
          </Text>
          <SafetyButton
            title={
              mapOpen
                ? "Close incident map"
                : "Open incident map / select a pin"
            }
            disabled={action.busy}
            onPress={() => setMapOpen((value) => !value)}
          />
          {mapOpen && (
            <EmergencyLocationPicker
              position={position}
              gps={gpsSnapshot}
              disabled={action.busy}
              onInteraction={() => {
                locationEpoch.current++;
                setLocating(false);
              }}
              onSelect={(selected) => {
                locationEpoch.current++;
                setLocating(false);
                setPosition(selected);
                setLocationMessage(
                  "Incident pin attached. Send the alert when ready.",
                );
              }}
            />
          )}
          <SafetyButton
            title={
              locating
                ? "Checking optional location..."
                : "Attach optional GPS snapshot"
            }
            disabled={action.busy || locating}
            onPress={() => void locate()}
          />
          {position && (
            <SafetyButton
              title="Remove location"
              disabled={action.busy}
              onPress={() => {
                locationEpoch.current++;
                setPosition(undefined);
                setLocationMessage("No location attached.");
              }}
            />
          )}
          <SafetyButton
            title={
              action.busy ? "Saving and sending..." : "Send emergency alert"
            }
            danger
            disabled={action.busy}
            onPress={confirmSend}
          />
          {newIncident && (
            <SafetyButton
              title="Cancel new incident"
              disabled={action.busy}
              onPress={() => {
                locationEpoch.current++;
                setLocating(false);
                setMapOpen(false);
                setPosition(undefined);
                setNewIncident(false);
              }}
            />
          )}
        </View>
      )}
      {draft && !newIncident && (
        <View style={s.card}>
          <Text style={s.heading}>Saved incident</Text>
          <Text style={s.text}>{draft.message || "No message entered."}</Text>
          <Text selectable style={s.text}>
            {incidentLocationText(draft.location)}
          </Text>
          {draft.location && (
            <>
              <SafetyButton
                title={
                  savedMapOpen
                    ? "Close saved incident map"
                    : "View saved incident point"
                }
                onPress={() => setSavedMapOpen((value) => !value)}
              />
              {savedMapOpen && (
                <EmergencyLocationPicker position={draft.location} disabled />
              )}
            </>
          )}
          {!current && (
            <Text style={s.warning}>
              {draft.alertId
                ? "Previously received by the server. Refresh for the latest Admin status."
                : "Receipt not confirmed on this device. Retry this saved alert; it keeps the same incident ID."}
            </Text>
          )}
          <SafetyButton
            title={
              action.busy
                ? "Sending saved alert..."
                : "Retry / confirm saved alert"
            }
            disabled={action.busy || local.busy}
            onPress={() =>
              void action.run(
                async (signal) => {
                  try {
                    await driverSafety.send(driverId, signal);
                  } finally {
                    await local.refresh();
                  }
                },
                () => {
                  void history.refresh();
                  void detail.refresh();
                },
              )
            }
          />
          {draft.alertId && (
            <SafetyButton
              title="Start a separate new incident"
              disabled={action.busy}
              onPress={() => {
                locationEpoch.current++;
                setLocating(false);
                setMapOpen(false);
                setSavedMapOpen(false);
                setGpsSnapshot(undefined);
                setNewIncident(true);
                setMessage("");
                setPosition(undefined);
                setLocationMessage("Location is optional.");
                action.clear();
              }}
            />
          )}
        </View>
      )}
      <SafetyButton
        title="Refresh saved alert and status"
        disabled={action.busy || local.busy || history.busy}
        onPress={() => {
          void local.refresh();
          void history.refresh();
          void detail.refresh();
        }}
      />
      {!!detail.error && (
        <Text style={s.warning}>
          {detail.error} Saved incident status may be out of date.
        </Text>
      )}
      {current && (
        <>
          <Text style={s.heading}>Saved incident status</Text>
          {detail.checkedAt && (
            <Text style={s.text}>
              Last checked: {new Date(detail.checkedAt).toLocaleString()}
            </Text>
          )}
          <AlertStatus item={current} />
        </>
      )}
      <Text style={s.heading}>Latest 25 alerts</Text>
      {!!history.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {history.error} Displayed results may be out of date.
        </Text>
      )}
      {history.checkedAt && (
        <Text style={s.text}>
          Last checked: {new Date(history.checkedAt).toLocaleString()}
        </Text>
      )}
      {history.busy && <Text style={s.text}>Checking server status...</Text>}
      {history.data?.length === 0 && (
        <Text style={s.text}>No alerts found on the server.</Text>
      )}
      {history.data?.map((item) => <AlertStatus key={item.id} item={item} />)}
    </ScrollView>
  );
}
