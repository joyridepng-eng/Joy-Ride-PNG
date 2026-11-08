import { useRiderAuth } from "@/contexts/rider-auth-context";
import { riderFeedback } from "@/services/rider-feedback";
import {
  identifier,
  ratings,
  type Feedback,
  type Ratings,
} from "@/services/rider-feedback-core";
import { useFeedbackAction, useFeedbackLoad } from "@/hooks/use-rider-feedback";
import {
  categories,
  categoryLabels,
  FeedbackButton,
  FeedbackReceipt,
  RatingInput,
  RatingSummary,
  styles,
} from "@/components/feedback-ui";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function RiderFeedbackScreen() {
  const { session } = useRiderAuth();
  const params = useLocalSearchParams<{ rideId?: string | string[] }>();
  let rideId: string | null = null;
  try {
    if (typeof params.rideId === "string") rideId = identifier(params.rideId);
  } catch {
    /* Invalid links never initiate requests. */
  }
  if (!session) return <Text>Sign in to access your ride feedback.</Text>;
  if (!rideId)
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.error}>
          Select a completed ride from its status or receipt.
        </Text>
        <FeedbackButton
          title="Return to Ride Request"
          onPress={() => router.replace("/request-ride" as Href)}
        />
      </ScrollView>
    );
  return (
    <FeedbackWorkspace
      key={`${session.rider.id}:${rideId}`}
      riderId={session.rider.id}
      rideId={rideId}
    />
  );
}
function FeedbackWorkspace({
  riderId,
  rideId,
}: {
  riderId: string;
  rideId: string;
}) {
  const state = useFeedbackLoad(
    useCallback(
      (signal: AbortSignal) => riderFeedback.load(riderId, rideId, signal),
      [riderId, rideId],
    ),
  );
  const action = useFeedbackAction();
  const [scores, setScores] = useState<Partial<Ratings>>({});
  const [comment, setComment] = useState("");
  const [attempted, setAttempted] = useState<Ratings>();
  const [confirmed, setConfirmed] = useState<Feedback | null>(null);
  const feedback = confirmed ?? state.data?.feedback;
  const pending = state.data?.pending?.payload ?? attempted;
  const editable =
    !!state.data?.eligible &&
    !state.error &&
    !feedback &&
    !pending &&
    !action.busy;
  const submit = (payload: Ratings | undefined) =>
    void action.run(
      async (signal) => {
        if (payload) setAttempted(payload);
        const result = await riderFeedback.submit(
          riderId,
          rideId,
          payload,
          signal,
        );
        if (!signal.aborted) {
          setConfirmed(result);
          setAttempted(undefined);
        }
      },
      () => {
        void state.refresh();
      },
    );
  function confirm() {
    if (!scores.overallRating) return;
    const payload = ratings({ ...scores, comment });
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(
          "Submit feedback? Ratings cannot be edited after submission. Your comment is available to Admin; Drivers see aggregate ratings.",
        )
      )
        submit(payload);
      return;
    }
    Alert.alert(
      "Submit ride feedback?",
      "Ratings cannot be edited after submission. Your comment is available to Admin; Drivers receive aggregate ratings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", onPress: () => submit(payload) },
      ],
    );
  }
  async function refresh() {
    const success = await state.refresh();
    if (success) {
      setAttempted(undefined);
      action.clear();
    }
  }
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Rate this ride</Text>
      <Text selectable style={styles.text}>
        Ride: {rideId}
      </Text>
      <Text style={styles.text}>
        1 = poor · 2 = fair · 3 = good · 4 = very good · 5 = excellent
      </Text>
      {!!state.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {state.error} Any displayed details may be out of date.
        </Text>
      )}
      {!!action.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {action.error}
        </Text>
      )}
      {state.busy && (
        <Text style={styles.text}>
          Checking ride eligibility and saved feedback...
        </Text>
      )}
      {state.data?.ride.driver && (
        <Text style={styles.heading}>
          Driver: {state.data.ride.driver.fullName}
        </Text>
      )}
      {state.checkedAt && (
        <Text style={styles.text}>
          Last checked: {new Date(state.checkedAt).toLocaleString()}
        </Text>
      )}
      {feedback ? (
        <FeedbackReceipt feedback={feedback} />
      ) : (
        <>
          {state.data && !state.data.eligible && (
            <Text style={styles.error}>
              Feedback is available after your ride is completed with an
              assigned Driver.
            </Text>
          )}
          {pending && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                Submission awaiting confirmation
              </Text>
              <Text style={styles.text}>
                Retry uses these same saved ratings. Refresh first if feedback
                may already have reached the server.
              </Text>
              <RatingSummary payload={pending} />
              <FeedbackButton
                title={
                  action.busy ? "Checking / sending..." : "Retry saved feedback"
                }
                disabled={action.busy || state.busy}
                onPress={() => submit(pending)}
              />
            </View>
          )}
          {editable && (
            <>
              <Text style={styles.text}>
                Overall rating is required. Other ratings and comments are
                optional.
              </Text>
              {categories.map((key) => (
                <RatingInput
                  key={key}
                  label={categoryLabels[key]}
                  value={scores[key]}
                  optional={key !== "overallRating"}
                  onChange={(value) =>
                    setScores((previous) => ({ ...previous, [key]: value }))
                  }
                />
              ))}
              <Text style={styles.heading}>Optional comment</Text>
              <TextInput
                accessibilityLabel="Optional feedback comment, up to 1000 characters"
                placeholder="Tell Admin about your experience"
                placeholderTextColor="#64748b"
                style={styles.input}
                multiline
                maxLength={1000}
                value={comment}
                onChangeText={setComment}
              />
              <Text style={styles.text}>
                {comment.length} / 1000 characters. Avoid sharing private
                contact details.
              </Text>
              <FeedbackButton
                title="Submit feedback"
                disabled={!scores.overallRating}
                onPress={confirm}
              />
            </>
          )}
        </>
      )}
      {Platform.OS === "web" && pending && (
        <Text style={styles.text}>
          Web retries are saved in this browser tab. Reopen this ride and check
          the server if the tab is closed.
        </Text>
      )}
      <FeedbackButton
        title="Refresh feedback status"
        disabled={action.busy || state.busy}
        onPress={() => void refresh()}
      />
      <FeedbackButton
        title="Return to ride status"
        disabled={action.busy}
        onPress={() =>
          router.replace(
            `/ride-status?rideId=${encodeURIComponent(rideId)}` as Href,
          )
        }
      />
    </ScrollView>
  );
}
