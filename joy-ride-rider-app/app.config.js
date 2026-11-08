module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  const existingPlugins = config.plugins ?? [];

  const secureStoreConfigured = existingPlugins.some(
    (plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-secure-store",
  );

  return {
    ...config,

    plugins: secureStoreConfigured
      ? existingPlugins
      : [...existingPlugins, "expo-secure-store"],

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
