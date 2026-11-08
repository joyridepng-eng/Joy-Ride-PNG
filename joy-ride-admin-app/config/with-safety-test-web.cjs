const TEST_API = "https://joyride-safety-test-api.onrender.com";

module.exports = (previous) => (args) => {
  if (process.env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST !== "1") {
    return previous(args);
  }
  if (
    process.env.EXPO_PUBLIC_JOYRIDE_VARIANT !== "safety-test" ||
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() !== TEST_API ||
    process.env.EAS_BUILD_PROFILE ||
    process.env.EAS_BUILD === "true"
  ) {
    throw new Error("Select an isolated laptop Safety Test web build, outside EAS native builds.");
  }
  return {
    name: "JoyRide Admin Safety Test",
    slug: "joy-ride-admin-app",
    scheme: "joyrideadminsafetytest",
    version: "1.1.0",
    platforms: ["web"],
    plugins: ["expo-router"],
    updates: { enabled: false },
    web: { bundler: "metro", output: "single", name: "JoyRide Admin Safety Test" },
    extra: { joyrideSafetyTest: true, joyrideTestApi: TEST_API },
  };
};
