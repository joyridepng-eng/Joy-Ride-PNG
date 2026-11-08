module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};

module.exports = require("./config/with-admin-apk.cjs")(module.exports);

module.exports = require("./config/with-safety-test.cjs")(module.exports);

module.exports = require("./config/with-safety-test-web.cjs")(module.exports);

module.exports = require("./config/with-pilot-production.cjs")(module.exports);

module.exports = require("./config/with-production-web.cjs")(module.exports);
