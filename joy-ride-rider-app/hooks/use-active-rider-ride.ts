import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  fetchActiveRiderRide,
  type ActiveRiderRide,
} from "../services/rider-active-ride";
import { subscribeToRiderSession } from "../services/rider-session";

export type ActiveRideRecoveryState =
  | { phase: "checking" }
  | { phase: "none" }
  | { phase: "active"; ride: ActiveRiderRide }
  | { phase: "error"; message: string };

const recoveryError: ActiveRideRecoveryState = {
  phase: "error",
  message: "Unable to check your current ride. Retry before booking.",
};

export function useActiveRiderRide() {
  const [state, setState] = useState<ActiveRideRecoveryState>({
    phase: "checking",
  });
  const sequence = useRef(0);
  const focused = useRef(false);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<ActiveRideRecoveryState> => {
    const request = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;

    if (focused.current) setState({ phase: "checking" });

    let result: ActiveRideRecoveryState;
    try {
      const ride = await fetchActiveRiderRide(controller.signal);
      result = ride ? { phase: "active", ride } : { phase: "none" };
    } catch {
      result = recoveryError;
    }

    if (
      request !== sequence.current ||
      controller.signal.aborted ||
      !focused.current
    ) {
      return recoveryError;
    }

    pending.current = null;
    setState(result);
    return result;
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();

      const appState = AppState.addEventListener("change", next => {
        if (next === "active") void refresh();
      });

      const unsubscribe = subscribeToRiderSession(() => {
        ++sequence.current;
        pending.current?.abort();
        setState({ phase: "checking" });
        void refresh();
      });

      return () => {
        focused.current = false;
        ++sequence.current;
        pending.current?.abort();
        pending.current = null;
        appState.remove();
        unsubscribe();
      };
    }, [refresh]),
  );

  return { state, refresh };
}
