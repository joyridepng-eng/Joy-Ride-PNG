const API = "https://explore-png-api.onrender.com";
function validOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === value && url.protocol === "https:" &&
      !url.username && !url.password && !url.port &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(url.hostname) &&
      !/^(?:localhost|.*\.(?:localhost|local))$/.test(url.hostname) &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname);
  } catch { return false; }
}
module.exports = (previous) => (args) => {
  if (process.env.EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION !== "1") return previous(args);
  if (
    process.env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST ||
    process.env.EXPO_PUBLIC_JOYRIDE_VARIANT ||
    process.env.EXPO_PUBLIC_API_BASE_URL !== API ||
    process.env.EXPO_NO_DOTENV !== "1" ||
    process.env.EAS_BUILD_PROFILE || process.env.EAS_BUILD === "true" ||
    !validOrigin(process.env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN) ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY
  ) throw new Error("Production web configuration refused.");
  return {
    name: "JoyRide Admin", slug: "joy-ride-admin-app", version: "1.1.0",
    platforms: ["web"], plugins: ["expo-router"], updates: { enabled: false },
    web: { bundler: "metro", output: "single", name: "JoyRide Admin" },
    extra: { joyrideProductionWeb: true, joyrideApi: API },
  };
};
module.exports.validOrigin = validOrigin;
