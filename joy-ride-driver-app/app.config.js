module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  const existingPlugins = config.plugins ?? [];

  const secureStoreConfigured = existingPlugins.some(
    (plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-secure-store",
  );

  if (process.env.EAS_BUILD_PROFILE === 'background-gps') {
    if (!googleMapsApiKey || !process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) {
      throw new Error('Configure the Maps key and API base URL in the EAS preview environment before building.');
    }
  }
  return {
    ...config,

    plugins: [
      ...(secureStoreConfigured ? existingPlugins : [...existingPlugins, "expo-secure-store"])
        .filter(plugin => !["expo-location", "expo-build-properties"].includes(Array.isArray(plugin) ? plugin[0] : plugin)),
      ["expo-location", { isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }],
      ["expo-build-properties", { android: { usesCleartextTraffic: process.env.EXPO_PUBLIC_API_BASE_URL?.startsWith("http://") === true } }],
    ],

    android: {
      ...config.android,

      config: {
        ...(config.android?.config ?? {}),

        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};

module.exports = require("./config/with-safety-test.cjs")(module.exports);

module.exports = require("./config/with-pilot-production.cjs")(module.exports);
