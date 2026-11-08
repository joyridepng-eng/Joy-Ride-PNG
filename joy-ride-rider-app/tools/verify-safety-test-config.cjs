const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const TEST_API = "https://joyride-safety-test-api.onrender.com";
const PRODUCTION_API = "https://explore-png-api.onrender.com";
const keys = ["EXPO_PUBLIC_JOYRIDE_VARIANT", "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY", "EAS_BUILD_PROFILE"];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const resolve = require(path.join(root, "app.config.js"));
const wrap = require(path.join(root, "config/with-safety-test.cjs"));
const staticConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8").replace(/^\uFEFF/, "")).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
const apiSource = fs.readFileSync(path.join(root, "constants/api.ts"), "utf8");
const compiled = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function api(env) {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { process: { env }, exports: module.exports, module });
  return module.exports.API_BASE_URL;
}
function environment(values) {
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
}
let count = 0;
function check(fn) { fn(); count += 1; }
try {
  const profile = eas.build["safety-test"];
  check(() => assert.equal(profile.env.EXPO_PUBLIC_API_BASE_URL, TEST_API));
  check(() => assert.equal(profile.env.EXPO_PUBLIC_JOYRIDE_VARIANT, "safety-test"));
  check(() => assert.equal(profile.env.EXPO_NO_DOTENV, "1"));
  check(() => assert.equal(profile.extends, undefined));
  check(() => assert.ok(profile.distribution === "internal" && profile.android.buildType === "apk" && profile.developmentClient === false));
  check(() => assert.ok(profile.environment === "preview" && profile.channel === "joyride-safety-test-v1" && profile.autoIncrement === false));
  environment({EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "synthetic-original-maps-key"});
  const baseline = resolve({config: structuredClone(staticConfig)});
  check(() => assert.equal(baseline.android.package, "com.explorepng.joyriderider"));
  const object = {android: {package: "com.explorepng.joyriderider"}, name: "Fixture"};
  check(() => assert.equal(wrap(() => object)({config: object}), object));
  environment({...profile.env, EAS_BUILD_PROFILE: "safety-test", EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "synthetic-original-maps-key", EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY: "synthetic-safety-maps-key"});
  const input = structuredClone(staticConfig);
  const snapshot = structuredClone(input);
  const test = resolve({config: input});
  check(() => assert.deepEqual(input, snapshot));
  check(() => assert.equal(test.android.package, "com.explorepng.joyriderider" + ".safetytest"));
  check(() => assert.equal(test.name, baseline.name + " Safety Test"));
  check(() => assert.equal(test.scheme, "joyrideridersafetytest"));
  check(() => assert.equal(test.updates.enabled, false));
  check(() => assert.equal(test.extra.joyrideSafetyTest, true));
  check(() => assert.equal(test.android.config.googleMaps.apiKey, "synthetic-safety-maps-key"));
  check(() => assert.deepEqual(test.plugins, baseline.plugins));
  check(() => assert.deepEqual(test.extra.eas, baseline.extra.eas));
  check(() => assert.deepEqual(test.runtimeVersion, baseline.runtimeVersion));
  check(() => assert.equal(api(profile.env), TEST_API));
  check(() => assert.equal(api({}), PRODUCTION_API));
  check(() => assert.equal(api({EXPO_PUBLIC_API_BASE_URL: TEST_API}), TEST_API));
  for (const url of [PRODUCTION_API, "http://localhost:3000", "", undefined, TEST_API + "/"]) {
    check(() => assert.throws(() => api({EXPO_PUBLIC_JOYRIDE_VARIANT: "safety-test", EXPO_PUBLIC_API_BASE_URL: url})));
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = url;
    check(() => assert.throws(() => resolve({config: structuredClone(staticConfig)})));
  }
  process.env.EXPO_PUBLIC_API_BASE_URL = TEST_API;
  delete process.env.EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY;
  check(() => assert.throws(() => resolve({config: structuredClone(staticConfig)})));
  delete process.env.EXPO_PUBLIC_JOYRIDE_VARIANT;
  check(() => assert.throws(() => resolve({config: structuredClone(staticConfig)})));
  environment({EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "synthetic-original-maps-key", EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY: "synthetic-safety-maps-key"});
  check(() => assert.deepEqual(resolve({config: structuredClone(staticConfig)}), baseline));
  console.log("PASS: " + count + " offline Safety Test routing and configuration checks.");
  console.log("Synthetic Maps values used. Real EAS variables, Maps authorization and phone behavior remain untested.");
} catch {
  console.log("STOP: Safety Test configuration contract. Raw details withheld.");
  process.exitCode = 1;
} finally {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
