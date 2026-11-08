import { API_BASE_URL } from "@/constants/api";
import { loadRiderSession } from "@/services/rider-session";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createFeedbackClient,
  FeedbackError,
  type Request,
} from "./rider-feedback-core";
import { createDraftStore } from "./feedback-draft-store";
export function createFeedbackRequest(timeoutMs = 15000): Request {
  return async (riderId, path, init = {}) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      const deadline = new Promise<never>((_, reject) => {
        abort = () => {
          controller.abort();
          reject(
            new FeedbackError(
              "Request interrupted. Refresh to check whether feedback was saved.",
            ),
          );
        };
        if (init.signal?.aborted) return abort();
        init.signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new FeedbackError(
              "No confirmation received. Refresh or retry the same saved ratings.",
            ),
          );
        }, timeoutMs);
      });
      const work = async () => {
        const session = await loadRiderSession();
        if (!session || session.rider.id !== riderId)
          throw new FeedbackError(
            "Sign in as the Rider who owns this ride before continuing.",
          );
        if (controller.signal.aborted)
          throw new FeedbackError("Request interrupted.");
        const response = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
        if (!response.ok) {
          const errors: Record<number, string> = {
            400: "This ride or these ratings are not eligible. Refresh before submitting.",
            401: "Your Rider session expired. Sign in again to check saved feedback.",
            403: "Feedback access was refused. Contact Admin.",
            404: "This ride or feedback feature is unavailable. Contact Admin if this continues.",
            409: "Feedback is already saved for this ride. Refresh to view the server record.",
            429: "Too many requests. Wait a minute before refreshing or retrying.",
          };
          throw new FeedbackError(
            errors[response.status] ??
              "Feedback service unavailable. Refresh or retry the same saved ratings.",
          );
        }
        return (await response.json()) as unknown;
      };
      return await Promise.race([deadline, work()]);
    } catch (e) {
      if (e instanceof FeedbackError) throw e;
      throw new FeedbackError(
        "Connection or response failed. Refresh to check confirmation or retry saved feedback.",
      );
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
    }
  };
}
const nativeOrWebStore = {
  read: async (key: string) =>
    Platform.OS === "web"
      ? typeof window === "undefined"
        ? null
        : window.sessionStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  write: async (key: string, value: string) => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined")
        throw new FeedbackError("Feedback storage is unavailable.");
      window.sessionStorage.setItem(key, value);
    } else
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
  },
  remove: async (key: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
    } else await SecureStore.deleteItemAsync(key);
  },
};
export const riderFeedback = createFeedbackClient(
  createDraftStore(nativeOrWebStore),
  createFeedbackRequest(),
);
