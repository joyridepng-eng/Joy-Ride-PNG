const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

if (
  process.env.EXPO_PUBLIC_JOYRIDE_VARIANT === "safety-test" &&
  configuredApiUrl !== "https://joyride-safety-test-api.onrender.com"
) {
  throw new Error("Safety Test backend configuration is invalid.");
}

export const API_BASE_URL =
  configuredApiUrl && configuredApiUrl.length > 0
    ? configuredApiUrl.replace(/\/+$/, "")
    : "https://explore-png-api.onrender.com";
