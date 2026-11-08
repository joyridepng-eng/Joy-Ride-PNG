import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useSafetyAction, useSafetyLoad } from "@/hooks/use-safety-request";
import {
  adminSafety,
  reviewTransitions,
  type FeedbackDetail,
  type ReviewStatus,
} from "@/services/admin-safety";
import {
  SafetyButton,
  SafetyLoadState,
  SafetyNotice,
  SafetyPage,
  s,
  safetyTime,
} from "@/components/safety-ui";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";

export default function FeedbackScreen() {
  const { session } = useAdminAuth();
  return session ? <FeedbackWorkspace key={session.admin.id} /> : null;
}
function FeedbackWorkspace() {
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReviewStatus>("NEW");
  const [cursor, setCursor] = useState<string | undefined>();
  if (id) return <FeedbackRecord key={id} id={id} back={() => setId(null)} />;
  return (
    <SafetyPage title="Rider feedback review">
      <SafetyNotice text="Private Admin review. Rider comments and internal notes are not included in the Driver rating summary. Review the circumstances before making performance decisions." />
      <View style={s.row}>
        {(["NEW", "REVIEWED", "FOLLOW_UP", "CLOSED"] as const).map((value) => (
          <SafetyButton
            key={value}
            title={(status === value ? "Selected: " : "") + value}
            onPress={() => {
              setStatus(value);
              setCursor(undefined);
            }}
          />
        ))}
      </View>
      <FeedbackResults
        key={`${status}:${cursor ?? "first"}`}
        status={status}
        cursor={cursor}
        setCursor={setCursor}
        open={setId}
      />
    </SafetyPage>
  );
}
function FeedbackResults({
  status,
  cursor,
  setCursor,
  open,
}: {
  status: ReviewStatus;
  cursor?: string;
  setCursor: (cursor: string | undefined) => void;
  open: (id: string) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => adminSafety.feedback(status, cursor, signal),
    [status, cursor],
  );
  const result = useSafetyLoad(load);
  return (
    <>
      <SafetyLoadState {...result} />
      <SafetyButton
        title="Refresh feedback"
        disabled={result.busy}
        onPress={() => {
          void result.refresh();
        }}
      />
      {!result.busy && !result.error && result.data?.items.length === 0 ? (
        <Text style={s.text}>No feedback in this view.</Text>
      ) : null}
      {result.data?.items.map((item) => (
        <View key={item.id} style={s.card}>
          <Text style={s.heading}>
            {item.driver.fullName} · {item.overallRating}/5
          </Text>
          <Text style={s.text}>{item.reviewStatus}</Text>
          <Text style={s.text}>
            {item.comment || "No written comment supplied."}
          </Text>
          <Text style={s.muted}>{safetyTime(item.createdAt)}</Text>
          <SafetyButton title="Review feedback" onPress={() => open(item.id)} />
        </View>
      ))}
      <View style={s.row}>
        {cursor ? (
          <SafetyButton
            title="Newest feedback"
            onPress={() => setCursor(undefined)}
          />
        ) : null}
        {result.data?.nextCursor ? (
          <SafetyButton
            title="Older feedback"
            disabled={result.busy || !!result.error}
            onPress={() => setCursor(result.data?.nextCursor ?? undefined)}
          />
        ) : null}
      </View>
    </>
  );
}
function FeedbackRecord({ id, back }: { id: string; back: () => void }) {
  const load = useCallback(
    (signal: AbortSignal) => adminSafety.feedbackDetail(id, signal),
    [id],
  );
  const result = useSafetyLoad(load);
  return (
    <SafetyPage title="Private feedback detail">
      <SafetyButton title="Back to feedback list" onPress={back} />
      <SafetyNotice text="Refreshing or returning to this screen reloads the review. If another Admin changed it, your unsaved note will be cleared. A saved review always records the acting Admin." />
      <SafetyLoadState {...result} />
      <SafetyButton
        title="Refresh review"
        disabled={result.busy}
        onPress={() => {
          void result.refresh();
        }}
      />
      {result.data ? (
        <FeedbackForm
          key={result.data.updatedAt}
          item={result.data}
          blocked={result.busy || !!result.error}
          refresh={result.refresh}
        />
      ) : null}
    </SafetyPage>
  );
}
function FeedbackForm({
  item,
  blocked,
  refresh,
}: {
  item: FeedbackDetail;
  blocked: boolean;
  refresh: () => Promise<boolean>;
}) {
  const action = useSafetyAction();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Exclude<ReviewStatus, "NEW"> | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <View style={s.card}>
        <Text style={s.heading}>
          {item.driver.fullName} · Overall {item.overallRating}/5
        </Text>
        <Text style={s.text}>Status: {item.reviewStatus}</Text>
        {(
          [
            ["Customer care", item.customerCareRating],
            ["Professionalism", item.professionalismRating],
            ["Driving", item.drivingRating],
            ["Cleanliness", item.cleanlinessRating],
          ] as const
        ).map(([label, rating]) => (
          <Text key={label} style={s.text}>
            {label}: {rating === null ? "Not rated" : `${rating}/5`}
          </Text>
        ))}
        <Text style={s.text}>
          Rider comment: {item.comment || "None supplied"}
        </Text>
        <Text selectable style={s.muted}>
          Ride reference: {item.rideId}
        </Text>
        <Text style={s.muted}>Submitted: {safetyTime(item.createdAt)}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>Record a review</Text>
        {action.error ? <SafetyNotice error text={action.error} /> : null}
        {saved ? (
          <SafetyNotice text="Review saved. Refresh to see its current status and audit trail." />
        ) : null}
        <View style={s.row}>
          {reviewTransitions[item.reviewStatus].map((value) => (
            <SafetyButton
              key={value}
              title={(status === value ? "Selected: " : "") + value}
              disabled={action.busy || saved}
              onPress={() => {
                setStatus(value);
                setConfirmation(false);
              }}
            />
          ))}
        </View>
        <Text style={s.text}>Private review note (required)</Text>
        <TextInput
          accessibilityLabel="Private feedback review note"
          multiline
          maxLength={1000}
          value={note}
          editable={!action.busy && !saved}
          onChangeText={(value) => {
            setNote(value);
            setConfirmation(false);
          }}
          style={s.input}
        />
        <Text style={s.muted}>{note.length}/1000</Text>
        <SafetyButton
          title="Review changes…"
          disabled={
            blocked ||
            action.busy ||
            !!action.error ||
            saved ||
            !status ||
            !note.trim()
          }
          onPress={() => setConfirmation(true)}
        />
        {confirmation && status ? (
          <>
            <SafetyNotice
              text={`Save ${item.reviewStatus} → ${status} with this note? This creates a private audit entry.`}
            />
            <View style={s.row}>
              <SafetyButton
                title="Cancel"
                disabled={action.busy}
                onPress={() => setConfirmation(false)}
              />
              <SafetyButton
                title={action.busy ? "Saving…" : "Confirm review"}
                disabled={
                  blocked ||
                  action.busy ||
                  !!action.error ||
                  saved ||
                  !note.trim()
                }
                onPress={() => {
                  void action.run(
                    (signal) => adminSafety.review(item, status, note, signal),
                    () => {
                      setSaved(true);
                      setNote("");
                      setConfirmation(false);
                      void refresh();
                    },
                  );
                }}
              />
            </View>
          </>
        ) : null}
        {action.error || saved ? (
          <SafetyButton
            title="Reload before continuing"
            disabled={blocked || action.busy}
            onPress={() => {
              void refresh().then((ok) => {
                if (ok) {
                  action.clear();
                  setConfirmation(false);
                }
              });
            }}
          />
        ) : null}
      </View>
      <View style={s.card}>
        <Text style={s.heading}>Latest review actions (up to 50)</Text>
        {item.reviewEvents.length === 0 ? (
          <Text style={s.text}>No review actions yet.</Text>
        ) : null}
        {item.reviewEvents.map((event) => (
          <View key={event.id}>
            <Text style={s.text}>
              {event.previousStatus} → {event.newStatus}
            </Text>
            <Text style={s.text}>{event.note}</Text>
            <Text selectable style={s.muted}>
              Admin reference: {event.adminId}
            </Text>
            <Text style={s.muted}>{safetyTime(event.createdAt)}</Text>
          </View>
        ))}
      </View>
    </>
  );
}
