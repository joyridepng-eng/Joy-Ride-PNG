import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Feedback, Ratings } from "@/services/rider-feedback-core";
export const categories = [
  "overallRating",
  "customerCareRating",
  "professionalismRating",
  "drivingRating",
  "cleanlinessRating",
] as const;
export const categoryLabels: Record<(typeof categories)[number], string> = {
  overallRating: "Overall experience",
  customerCareRating: "Customer care",
  professionalismRating: "Professionalism",
  drivingRating: "Driving",
  cleanlinessRating: "Vehicle cleanliness",
};
export function FeedbackButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function RatingInput({
  label,
  value,
  onChange,
  optional = false,
  disabled = false,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>
        {label}
        {optional ? " (optional)" : " (required)"}
      </Text>
      <View style={styles.scores}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${n} out of 5`}
            accessibilityState={{ checked: value === n, disabled }}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={[styles.score, value === n && styles.selected]}
          >
            <Text
              style={[styles.scoreText, value === n && styles.selectedText]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.text}>
        {value === undefined ? "Not selected" : `${value} / 5`}
      </Text>
      {optional && value !== undefined && (
        <FeedbackButton
          title={`Clear ${label.toLowerCase()} rating`}
          disabled={disabled}
          onPress={() => onChange(undefined)}
        />
      )}
    </View>
  );
}
export function RatingSummary({ payload }: { payload: Ratings }) {
  return (
    <View style={styles.card}>
      {categories.map((key) => (
        <Text key={key} style={styles.text}>
          {categoryLabels[key]}:{" "}
          {payload[key] === undefined ? "Not rated" : `${payload[key]} / 5`}
        </Text>
      ))}
      {payload.comment && (
        <Text selectable style={styles.text}>
          {payload.comment}
        </Text>
      )}
    </View>
  );
}
export function FeedbackReceipt({ feedback }: { feedback: Feedback }) {
  const payload: Ratings = {
    overallRating: feedback.overallRating,
    ...(feedback.comment ? { comment: feedback.comment } : {}),
  };
  for (const key of categories)
    if (key !== "overallRating" && feedback[key] !== null)
      payload[key] = feedback[key];
  return (
    <View>
      <Text accessibilityRole="header" style={styles.title}>
        Feedback received
      </Text>
      <Text style={styles.text}>
        Saved by Joy Ride on {new Date(feedback.createdAt).toLocaleString()}.
      </Text>
      <Text selectable style={styles.text}>
        Reference: {feedback.id}
      </Text>
      <RatingSummary payload={payload} />
      <Text style={styles.text}>
        One submission is allowed per ride. Your comment is available to Admin;
        Drivers see aggregate ratings.
      </Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 14,
    backgroundColor: "#f8fafc",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  heading: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  text: { fontSize: 16, lineHeight: 24, color: "#334155" },
  error: { fontSize: 16, lineHeight: 24, color: "#991b1b" },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    gap: 10,
    marginVertical: 6,
  },
  button: {
    padding: 15,
    minHeight: 48,
    backgroundColor: "#0f766e",
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#fff",
  },
  disabled: { opacity: 0.5 },
  scores: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  score: {
    minHeight: 48,
    minWidth: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 8,
    alignItems: "center",
  },
  selected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  scoreText: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  selectedText: { color: "#fff" },
  input: {
    padding: 12,
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 8,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
});
