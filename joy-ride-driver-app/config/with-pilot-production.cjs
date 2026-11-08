const PRODUCTION_API = "https://explore-png-api.onrender.com";
const EXPECTED_PACKAGE = "com.explorepng.joyride.driver";
module.exports = (previous) => (args) => {
  if (process.env.EAS_BUILD_PROFILE !== "pilot-production") return previous(args);
  if (
    process.env.EXPO_PUBLIC_API_BASE_URL !== PRODUCTION_API ||
    process.env.EXPO_PUBLIC_JOYRIDE_VARIANT ||
    process.env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST ||
    process.env.EXPO_NO_DOTENV !== "1" ||
    !process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  ) {
    throw new Error("Pilot requires explicit production API/Maps configuration without test variants or dotenv.");
  }
  const config = previous(args);
  if (!config || typeof config !== "object" || typeof config.then === "function" ||
      config.android?.package !== EXPECTED_PACKAGE || config.extra?.joyrideSafetyTest ||
      config.android?.config?.googleMaps?.apiKey?.trim() !== process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.trim()) {
    throw new Error("Pilot package or native Maps configuration does not match the reviewed production app.");
  }
  return { ...config, updates: { ...config.updates, enabled: false } };
};
