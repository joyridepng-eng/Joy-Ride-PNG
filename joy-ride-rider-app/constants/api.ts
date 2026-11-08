const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

if (
  process.env.EXPO_PUBLIC_JOYRIDE_VARIANT === "safety-test" &&
  configuredApiBaseUrl !== "https://joyride-safety-test-api.onrender.com"
) {
  throw new Error("Safety Test backend configuration is invalid.");
}

export const API_BASE_URL =
  configuredApiBaseUrl ||
  "https://explore-png-api.onrender.com";
