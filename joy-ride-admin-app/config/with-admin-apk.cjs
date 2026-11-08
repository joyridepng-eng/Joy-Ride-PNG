module.exports = previous => args => {
  const config = previous(args);
  if (!config || typeof config !== 'object' || typeof config.then === 'function') throw new Error('Expected synchronous Admin app configuration.');
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (process.env.EAS_BUILD_PROFILE === 'admin-test' && (!apiUrl || !mapsKey)) {
    throw new Error('Set the API base URL and Android Maps key in the ADMIN project Preview environment before building.');
  }
  const plugins = [...(config.plugins ?? [])];
  const name = plugin => Array.isArray(plugin) ? plugin[0] : plugin;
  if (!plugins.some(p => name(p) === 'expo-secure-store')) plugins.push('expo-secure-store');
  const index = plugins.findIndex(p => name(p) === 'expo-build-properties');
  const options = index >= 0 && Array.isArray(plugins[index]) ? plugins[index][1] ?? {} : {};
  const properties = ['expo-build-properties', { ...options, android: {
    ...(options.android ?? {}), usesCleartextTraffic: apiUrl?.startsWith('http://') === true,
  } }];
  if (index >= 0) plugins[index] = properties; else plugins.push(properties);
  return { ...config, plugins };
};
