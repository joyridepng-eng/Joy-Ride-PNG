import { useDriverAuth } from "@/contexts/driver-auth-context";
import { driverSafety } from "@/services/driver-safety";
import { useSafetyLoad } from "@/hooks/use-driver-safety";
import { SafetyButton, s } from "@/components/driver-safety-ui";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
export default function RatingsScreen() {
  const { session } = useDriverAuth();
  return session ? (
    <Ratings key={session.driver.id} driverId={session.driver.id} />
  ) : (
    <Text>Sign in to see your ratings.</Text>
  );
}
function Ratings({ driverId }: { driverId: string }) {
  const state = useSafetyLoad(
    useCallback(
      (signal: AbortSignal) => driverSafety.summary(driverId, signal),
      [driverId],
    ),
  );
  const categories = [
    "overall",
    "customerCare",
    "professionalism",
    "driving",
    "cleanliness",
  ] as const;
  const labels = {
    overall: "Overall",
    customerCare: "Customer care",
    professionalism: "Professionalism",
    driving: "Driving",
    cleanliness: "Cleanliness",
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>My Rider ratings</Text>
      <Text style={s.text}>
        Ratings from completed rides. Rider comments and private Admin reviews
        are not included.
      </Text>
      <SafetyButton
        title={state.busy ? "Loading ratings..." : "Refresh ratings"}
        disabled={state.busy}
        onPress={() => {
          void state.refresh();
        }}
      />
      {!!state.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {state.error} Any displayed ratings may be out of date.
        </Text>
      )}
      {state.checkedAt && (
        <Text style={s.text}>
          Last checked: {new Date(state.checkedAt).toLocaleString()}
        </Text>
      )}
      {state.data && (
        <>
          <Text style={s.heading}>{state.data.ratingCount} rated rides</Text>
          {categories.map((key) => {
            const rating = state.data![key];
            return (
              <View key={key} style={s.card}>
                <Text style={s.heading}>{labels[key]}</Text>
                <Text style={s.text}>
                  {rating.average === null
                    ? "Not yet rated"
                    : `${rating.average.toFixed(2)} / 5 · ${rating.count} ratings`}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
