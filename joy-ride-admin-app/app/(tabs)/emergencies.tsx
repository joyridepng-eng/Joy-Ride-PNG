import EmergencyTracking from "@/components/emergency-tracking";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useSafetyAction, useSafetyLoad } from "@/hooks/use-safety-request";
import { adminSafety, type EmergencyStatus } from "@/services/admin-safety";
import {
  SafetyButton,
  SafetyLoadState,
  SafetyNotice,
  SafetyPage,
  s,
  safetyTime,
} from "@/components/safety-ui";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";

export default function EmergenciesScreen() {
  const { session } = useAdminAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  if (!session) return null;
  const id = typeof params.id === "string" ? params.id : "";
  return id ? (
    <EmergencyRecord key={`${session.admin.id}:${id}`} id={id} />
  ) : (
    <EmergencyQueue key={session.admin.id} />
  );
}
function EmergencyQueue() {
  const [status, setStatus] = useState<EmergencyStatus>("OPEN");
  const [cursor, setCursor] = useState<string | undefined>();
  return (
    <SafetyPage title="Driver emergencies">
      <SafetyNotice text="Keep this queue open while on duty. It checks every 15 seconds while visible and active. This version has no closed-app push alerts, sound or automatic emergency dispatch." />
      <View style={s.row}>
        {(["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const).map((value) => (
          <SafetyButton
            key={value}
            title={(value === status ? "Selected: " : "") + value}
            danger={value === "OPEN"}
            onPress={() => {
              setStatus(value);
              setCursor(undefined);
            }}
          />
        ))}
      </View>
      <QueueResults
        key={`${status}:${cursor ?? "first"}`}
        status={status}
        cursor={cursor}
        setCursor={setCursor}
      />
    </SafetyPage>
  );
}
function QueueResults({
  status,
  cursor,
  setCursor,
}: {
  status: EmergencyStatus;
  cursor?: string;
  setCursor: (value: string | undefined) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => adminSafety.emergencies(status, cursor, signal),
    [status, cursor],
  );
  const result = useSafetyLoad(load, cursor ? 0 : 15000);
  return (
    <>
      <SafetyLoadState {...result} />
      <SafetyButton
        title="Refresh queue"
        disabled={result.busy}
        onPress={() => {
          void result.refresh();
        }}
      />
      {!result.busy && !result.error && result.data?.items.length === 0 ? (
        <Text style={s.text}>
          No {status.toLowerCase()} alerts in this view.
        </Text>
      ) : null}
      {result.data?.items.map((item) => (
        <View
          key={item.id}
          style={[s.card, item.status === "OPEN" && s.urgentCard]}
        >
          <Text style={s.heading}>{item.driver.fullName}</Text>
          <Text style={s.text}>
            {item.status} · Received {safetyTime(item.createdAt)}
          </Text>
          <Text style={s.text}>
            {item.message ||
              "No message supplied. Contact the driver to assess the situation."}
          </Text>
          <Text selectable style={s.text}>
            Driver phone: {item.driver.phone}
          </Text>
          <Text style={s.muted}>
            {item.latitude === null
              ? "No location supplied"
              : `Location recorded ${safetyTime(item.locationRecordedAt)}`}
          </Text>
          <SafetyButton
            title="Open alert"
            danger={item.status === "OPEN"}
            onPress={() => {
              const alertId = item.id;
              if (alertId)
                router.push(
                  `/emergencies?id=${encodeURIComponent(alertId)}` as Href,
                );
            }}
          />
        </View>
      ))}
      <View style={s.row}>
        {cursor ? (
          <SafetyButton
            title="Newest alerts"
            onPress={() => setCursor(undefined)}
          />
        ) : null}
        {result.data?.nextCursor ? (
          <SafetyButton
            title="Older alerts"
            disabled={result.busy || !!result.error}
            onPress={() => setCursor(result.data?.nextCursor ?? undefined)}
          />
        ) : null}
      </View>
    </>
  );
}
function EmergencyRecord({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) => adminSafety.emergency(id, signal),
    [id],
  );
  const result = useSafetyLoad(load, 15000);
  const action = useSafetyAction();
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<
    "acknowledge" | "resolve" | null
  >(null);
  const [notice, setNotice] = useState("");
  const item = result.data;
  const blocked =
    result.busy || action.busy || !!result.error || !!action.error;
  async function refresh() {
    if (await result.refresh()) {
      action.clear();
      setConfirmation(null);
      setNotice("");
    }
  }
  async function openLocation() {
    if (!item || item.latitude === null || item.longitude === null) return;
    try {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`,
      );
    } catch {
      setNotice(
        "Could not open Maps. Use the displayed coordinates and contact the driver.",
      );
    }
  }
  return (
    <SafetyPage title="Emergency detail">
      <SafetyButton
        title="Back to emergency queue"
        disabled={action.busy}
        onPress={() => router.replace("/emergencies" as Href)}
      />
      <SafetyLoadState {...result} />
      <SafetyButton
        title="Refresh status"
        disabled={action.busy || result.busy}
        onPress={() => {
          void refresh();
        }}
      />
      {action.error ? <SafetyNotice error text={action.error} /> : null}
      {notice ? <SafetyNotice text={notice} /> : null}
      {item ? (
        <>
          <View style={[s.card, item.status === "OPEN" && s.urgentCard]}>
            <Text style={s.heading}>
              {item.driver.fullName} — {item.status}
            </Text>
            <Text selectable style={s.text}>
              Phone: {item.driver.phone}
            </Text>
            <Text style={s.text}>{item.message || "No message supplied."}</Text>
            <Text style={s.muted}>
              Server receipt: {safetyTime(item.createdAt)}
            </Text>
            <Text style={s.muted}>
              Acknowledged: {safetyTime(item.acknowledgedAt)}
            </Text>
            <Text style={s.muted}>Resolved: {safetyTime(item.resolvedAt)}</Text>
            <Text selectable style={s.muted}>
              Alert reference: {item.id}
            </Text>
            <Text selectable style={s.muted}>
              Ride: {item.ride?.id ?? "Not linked to a ride"}
            </Text>
            <Text style={s.text}>
              Ride vehicle: {item.ride?.vehicle?.plateNumber ?? "Not recorded"}
            </Text>
            <Text style={s.muted}>
              Current active vehicle registrations:{" "}
              {item.driver.vehicles.map((v) => v.plateNumber).join(", ") ||
                "None recorded"}
              . These do not confirm the vehicle at the incident.
            </Text>
          </View>
          <EmergencyTracking
            key={`${item.id}:${item.driver.id}`}
            item={item}
            detailError={!!result.error}
          />
          <SafetyButton
            title="Open saved incident coordinates in Maps"
            disabled={item.latitude === null}
            onPress={() => {
              void openLocation();
            }}
          />
          {item.status !== "RESOLVED" ? (
            <View style={s.card}>
              <Text style={s.heading}>Admin response</Text>
              <Text style={s.text}>
                Acknowledgement records that an Admin has taken responsibility
                to respond. It does not confirm assistance has arrived. Reading
                the inbox does not acknowledge this alert.
              </Text>
              <Text style={s.text}>
                {item.status === "OPEN"
                  ? "Acknowledgement note (optional)"
                  : "Resolution note (required)"}
              </Text>
              <TextInput
                accessibilityLabel="Private Admin response note"
                multiline
                maxLength={1000}
                value={note}
                editable={!action.busy}
                onChangeText={(value) => {
                  setNote(value);
                  setConfirmation(null);
                }}
                style={s.input}
              />
              <Text style={s.muted}>
                {note.length}/1000 · Visible to Admins only
              </Text>
              <SafetyButton
                title={
                  item.status === "OPEN"
                    ? "Acknowledge alert…"
                    : "Resolve alert…"
                }
                danger
                disabled={
                  blocked || (item.status === "ACKNOWLEDGED" && !note.trim())
                }
                onPress={() =>
                  setConfirmation(
                    item.status === "OPEN" ? "acknowledge" : "resolve",
                  )
                }
              />
              {confirmation ? (
                <>
                  <SafetyNotice
                    text={
                      confirmation === "acknowledge"
                        ? "Confirm that you are taking responsibility to respond to this driver."
                        : "Confirm that the incident can be closed and your note explains the outcome. Resolution cannot be undone in this version."
                    }
                  />
                  <View style={s.row}>
                    <SafetyButton
                      title="Cancel"
                      disabled={action.busy}
                      onPress={() => setConfirmation(null)}
                    />
                    <SafetyButton
                      title={action.busy ? "Saving…" : "Confirm response"}
                      danger
                      disabled={
                        blocked ||
                        (confirmation === "acknowledge"
                          ? item.status !== "OPEN"
                          : item.status !== "ACKNOWLEDGED" || !note.trim())
                      }
                      onPress={() => {
                        void action.run(
                          (signal) =>
                            confirmation === "acknowledge"
                              ? adminSafety.acknowledge(id, note, signal)
                              : adminSafety.resolve(id, note, signal),
                          () => {
                            setNote("");
                            setConfirmation(null);
                            setNotice("Response saved by the server.");
                            void result.refresh();
                          },
                        );
                      }}
                    />
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
          <View style={s.card}>
            <Text style={s.heading}>Audit trail</Text>
            {item.events.map((event) => (
              <View key={event.id}>
                <Text style={s.text}>
                  {event.action} ·{" "}
                  {event.admin?.fullName ?? "Driver submission"}
                </Text>
                <Text style={s.muted}>{safetyTime(event.createdAt)}</Text>
                {event.note ? <Text style={s.text}>{event.note}</Text> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </SafetyPage>
  );
}
