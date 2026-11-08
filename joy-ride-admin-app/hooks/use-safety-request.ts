import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { safetyMessage } from "@/services/admin-safety";

// Every focus/filter change owns its requests. Late results cannot replace a
// different record or populate a screen after sign-out/unmount.
export function useSafetyLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  pollMs = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!active.current) return false;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const value = await load(controller.signal);
      if (
        !active.current ||
        request.current !== controller ||
        controller.signal.aborted
      )
        return false;
      setData(value);
      setError("");
      setCheckedAt(Date.now());
      return true;
    } catch (caught) {
      if (
        active.current &&
        request.current === controller &&
        !controller.signal.aborted
      )
        setError(safetyMessage(caught));
      return false;
    } finally {
      if (active.current && request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      setData(null);
      setError("");
      setCheckedAt(null);
      setBusy(false);
      active.current =
        AppState.currentState !== "background" &&
        AppState.currentState !== "inactive";
      void refresh();
      const timer = pollMs
        ? setInterval(() => {
            if (!request.current) void refresh();
          }, pollMs)
        : undefined;
      const subscription = AppState.addEventListener("change", (state) => {
        active.current = state === "active";
        if (active.current) void refresh();
        else {
          request.current?.abort();
          request.current = null;
          setBusy(false);
        }
      });
      return () => {
        active.current = false;
        request.current?.abort();
        request.current = null;
        if (timer) clearInterval(timer);
        subscription.remove();
      };
    }, [refresh, pollMs]),
  );
  return { data, error, busy, checkedAt, refresh };
}

export function useSafetyAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setBusy(false);
      const subscription = AppState.addEventListener("change", (state) => {
        active.current = state === "active";
        if (!active.current && request.current) {
          request.current.abort();
          request.current = null;
          setBusy(false);
          setError(
            "The request result is unknown. Refresh before taking another action.",
          );
        }
      });
      return () => {
        active.current = false;
        request.current?.abort();
        request.current = null;
        subscription.remove();
      };
    }, []),
  );
  const run = async (
    work: (signal: AbortSignal) => Promise<unknown>,
    success: () => void,
  ) => {
    if (!active.current || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await work(controller.signal);
      if (
        active.current &&
        request.current === controller &&
        !controller.signal.aborted
      )
        success();
    } catch (caught) {
      if (
        active.current &&
        request.current === controller &&
        !controller.signal.aborted
      )
        setError(safetyMessage(caught));
    } finally {
      if (active.current && request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return { busy, error, run, clear: () => setError("") };
}
