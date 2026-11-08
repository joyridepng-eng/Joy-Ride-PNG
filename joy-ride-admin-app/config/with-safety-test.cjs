const TEST_API = "https://joyride-safety-test-api.onrender.com";

module.exports = (previous) => (args) => {
  const variant = process.env.EXPO_PUBLIC_JOYRIDE_VARIANT;
  if (process.env.EAS_BUILD_PROFILE === "safety-test" && variant !== "safety-test") {
    throw new Error("Safety Test variant configuration is missing.");
  }
  if (variant !== "safety-test") return previous(args);
  if (process.env.EXPO_PUBLIC_API_BASE_URL?.trim() !== TEST_API) {
    throw new Error("Safety Test must use the isolated test backend.");
  }
  const mapsKey = process.env.EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsKey) throw new Error("Configure the separate Safety Test Android Maps key before building.");
  const config = previous(args);
  if (!config || typeof config !== "object" || typeof config.then === "function") {
    throw new Error("Expected synchronous app configuration.");
  }
  if (!config.android?.package || config.android.package.endsWith(".safetytest")) {
    throw new Error("Expected the original Android application identifier.");
  }
  return {
    ...config,
    name: config.name + " Safety Test",
    scheme: "joyrideadminsafetytest",
    android: {
      ...config.android,
      package: config.android.package + ".safetytest",
      config: {
        ...config.android.config,
        googleMaps: { ...config.android.config?.googleMaps, apiKey: mapsKey },
      },
    },
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, joyrideSafetyTest: true },
  };
};
