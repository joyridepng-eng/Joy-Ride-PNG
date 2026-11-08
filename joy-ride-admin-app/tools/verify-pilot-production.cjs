const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const keys = ["EAS_BUILD_PROFILE", "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "EXPO_PUBLIC_JOYRIDE_VARIANT", "EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST", "EXPO_NO_DOTENV", "EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
function environment(values) {
  keys.forEach(key => delete process.env[key]);
  Object.assign(process.env, values);
}
try {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  const profile = eas.build["pilot-production"];
  assert.equal(profile.environment, "production");
  assert.equal(profile.distribution, "internal");
  assert.equal(profile.android.buildType, "apk");
  assert.equal(profile.android.credentialsSource, "remote");
  assert.equal(profile.developmentClient, false);
  assert.equal(profile.autoIncrement, true);
  assert.equal(profile.extends, undefined);
  assert.deepEqual(profile.env, { EXPO_PUBLIC_API_BASE_URL: "https://explore-png-api.onrender.com", EXPO_NO_DOTENV: "1" });
  assert.equal(eas.build.production.environment, "production");
  assert.equal(eas.build["safety-test"].environment, "preview");
  const original = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
  const sourceBefore = JSON.stringify(original);
  const values = { ...profile.env, EAS_BUILD_PROFILE: "pilot-production", EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "synthetic-offline-maps-value" };
  const resolve = require(path.join(root, "app.config.js"));
  environment(values);
  const pilot = resolve({ config: original });
  assert.equal(pilot.android.package, "com.explorepng.joyrideadmin");
  assert.equal(pilot.android.config.googleMaps.apiKey, values.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  assert.equal(pilot.updates.enabled, false);
  assert.equal(pilot.name, original.name);
  assert.equal(pilot.scheme, original.scheme);
  assert.deepEqual(pilot.extra?.eas, original.extra?.eas);
  assert.equal(JSON.stringify(original), sourceBefore);
  const invalid = [
    { EXPO_PUBLIC_API_BASE_URL: "https://joyride-safety-test-api.onrender.com" },
    { EXPO_PUBLIC_API_BASE_URL: "https://explore-png-api.onrender.com/" },
    { EXPO_PUBLIC_API_BASE_URL: "" },
    { EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "" },
    { EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "   " },
    { EXPO_PUBLIC_JOYRIDE_VARIANT: "safety-test" },
    { EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: "1" },
    { EXPO_NO_DOTENV: "" },
  ];
  for (const change of invalid) {
    environment({ ...values, ...change });
    assert.throws(() => resolve({ config: original }));
  }
  environment(values);
  assert.throws(() => resolve({ config: { ...original, android: { ...original.android, package: original.android.package + ".safetytest" } } }));
  environment({});
  const sentinel = { marker: true };
  const wrap = require(path.join(root, "config/with-pilot-production.cjs"));
  assert.equal(wrap(() => sentinel)({}), sentinel);
  console.log("PASS: Pilot APK profile, production targeting, native identity, Maps wiring, test rejection and disabled OTA contracts.");
} catch {
  console.log("STOP: Pilot configuration contracts. Raw details withheld.");
  process.exitCode = 1;
} finally {
  keys.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
}
