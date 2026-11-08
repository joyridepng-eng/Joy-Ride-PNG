const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const TEST_API = "https://joyride-safety-test-api.onrender.com";
const keys = ["EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST", "EXPO_PUBLIC_JOYRIDE_WEB_LOCAL", "EXPO_PUBLIC_JOYRIDE_VARIANT", "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY", "EAS_BUILD_PROFILE", "EAS_BUILD"];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const source = fs.readFileSync(path.join(root, "constants/api.web.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const wrap = require(path.join(root, "config/with-safety-test-web.cjs"));
function api(env) {
  const exported = {};
  vm.runInNewContext(compiled, { process: { env }, exports: exported });
  return exported.API_BASE_URL;
}
function environment(value) {
  keys.forEach((key) => delete process.env[key]);
  Object.assign(process.env, value);
}
try {
  const values = { EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: "1", EXPO_PUBLIC_JOYRIDE_VARIANT: "safety-test", EXPO_PUBLIC_API_BASE_URL: TEST_API };
  const original = { name: "Native fixture", android: { package: "unchanged", config: { googleMaps: { apiKey: "synthetic-native-value" } } }, extra: { fixture: "unchanged" } };
  environment({});
  let nativeCalls = 0;
  const resolve = wrap(() => { nativeCalls += 1; return original; });
  assert.equal(resolve({ config: original }), original);
  assert.equal(nativeCalls, 1);
  environment(values);
  const before = JSON.stringify(original);
  const web = resolve({ config: original });
  assert.equal(nativeCalls, 1);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(web.platforms, ["web"]);
  assert.equal(web.extra.joyrideSafetyTest, true);
  assert.equal(web.extra.joyrideTestApi, TEST_API);
  assert.equal(web.updates.enabled, false);
  assert.equal(web.web.output, "single");
  assert.equal(web.android, undefined);
  assert.equal(web.extra.eas, undefined);
  assert.equal(JSON.stringify(web).includes("synthetic-native-value"), false);
  assert.equal(api(values), TEST_API);
  const localValues = { EXPO_PUBLIC_JOYRIDE_WEB_LOCAL: "1", EXPO_PUBLIC_JOYRIDE_VARIANT: "local", EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000" };
  assert.equal(api(localValues), "http://localhost:3000");
  assert.throws(() => api({ ...localValues, EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3000" }));
  assert.throws(() => api({ ...localValues, EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: "1" }));
  for (const change of [{ EXPO_PUBLIC_JOYRIDE_VARIANT: undefined }, { EXPO_PUBLIC_API_BASE_URL: "https://explore-png-api.onrender.com" }, { EXPO_PUBLIC_API_BASE_URL: undefined }]) {
    const invalid = { ...values, ...change }; environment(invalid);
    assert.throws(() => resolve({ config: original }));
    assert.throws(() => api(invalid));
  }
  for (const change of [{ EAS_BUILD_PROFILE: "safety-test" }, { EAS_BUILD: "true" }]) {
    environment({ ...values, ...change });
    assert.throws(() => resolve({ config: original }));
  }
  assert.throws(() => api({}));
  assert.throws(() => api({ ...values, EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: undefined }));
  environment(values);
  const config = require(path.join(root, "app.config.js"))({ config: original });
  assert.deepEqual(config, web);
  console.log("PASS: Explicit browser test routing, key-free configuration, native passthrough, input preservation and EAS-native isolation.");
} catch {
  console.log("STOP: Browser configuration contracts. Raw details withheld."); process.exitCode = 1;
} finally {
  keys.forEach((key) => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
}
