const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const wrap = require("../config/with-production-web.cjs");
const core = require("./production-web-core.cjs");
const env = {
  EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION: "1", EXPO_PUBLIC_API_BASE_URL: "https://explore-png-api.onrender.com",
  EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN: "https://joyride-ci.invalid", EXPO_NO_DOTENV: "1",
};
const keys = [...Object.keys(env), "EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST", "EXPO_PUBLIC_JOYRIDE_VARIANT", "EAS_BUILD_PROFILE", "EAS_BUILD", "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY", "JOYRIDE_PRODUCTION_WEB_MAPS_KEY"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const syntheticKey = ["AIza", "X".repeat(35)].join("");
function set(value) { keys.forEach(key => delete process.env[key]); Object.assign(process.env, value); }
function api(value) {
  const source = fs.readFileSync(path.join(root, "constants/api.web.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, { process: { env: value }, exports: exported });
  return exported.API_BASE_URL;
}
async function mapProbe(changes, responseChanges, origin, expected) {
  const source = fs.readFileSync(path.join(root, "components/emergency-map/google.web.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {}; let requests = 0;
  const window = { location: { origin }, setTimeout, clearTimeout, dispatchEvent() {}, google: { maps: {
    importLibrary: async name => name === "maps" ? { Map: class {}, Circle: class {} } : name === "marker" ? { AdvancedMarkerElement: class {} } : { LatLngBounds: class {} }, event: { clearInstanceListeners() {} },
  } } };
  vm.runInNewContext(compiled, { exports: exported, process: { env: { ...env, ...changes } }, window, URL, AbortController,
    fetch: async () => { requests += 1; return { ok: true, json: async () => ({ production: true, safetyTest: false, origin: env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, key: syntheticKey, ...responseChanges }) }; },
  });
  if (expected) { await exported.loadGoogleMaps(); assert.equal(requests, 1); }
  else await assert.rejects(exported.loadGoogleMaps());
  if (origin !== env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN) assert.equal(requests, 0);
}
async function main() {
  let temporary;
  try {
    const original = { name: "Native", android: { package: "unchanged" } };
    const resolve = wrap(() => original);
    set({}); assert.equal(resolve({ config: original }), original);
    set(env); const config = resolve({ config: original });
    assert.deepEqual(config.platforms, ["web"]); assert.equal(config.android, undefined);
    assert.equal(config.updates.enabled, false); assert.equal(config.extra.joyrideProductionWeb, true);
    assert.equal(JSON.stringify(config).includes(syntheticKey), false);
    assert.equal(api(env), env.EXPO_PUBLIC_API_BASE_URL);
    for (const change of [
      { EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: "1" }, { EXPO_PUBLIC_JOYRIDE_VARIANT: "safety-test" },
      { EXPO_PUBLIC_API_BASE_URL: "https://joyride-safety-test-api.onrender.com" },
      { EXPO_PUBLIC_API_BASE_URL: env.EXPO_PUBLIC_API_BASE_URL + "/" },
    ]) { set({ ...env, ...change }); assert.throws(() => resolve({ config: original })); assert.throws(() => api({ ...env, ...change })); }
    for (const change of [
      { EXPO_NO_DOTENV: "0" }, { EAS_BUILD_PROFILE: "production" }, { EAS_BUILD: "true" },
      { EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: syntheticKey }, { EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY: syntheticKey },
      { EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN: "http://localhost:8081" },
    ]) { set({ ...env, ...change }); assert.throws(() => resolve({ config: original })); assert.throws(() => core.settings({ ...env, ...change }, false)); }
    for (const origin of ["https://x.invalid/", "https://u:p@x.invalid", "https://x.invalid/a", "https://x.invalid?x=1", "https://x.invalid#x", "https://127.0.0.1", "https://localhost", "https://x.local", "https://x.invalid:443", " https://x.invalid"]) assert.equal(wrap.validOrigin(origin), false);
    const test = { EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST: "1", EXPO_PUBLIC_JOYRIDE_VARIANT: "safety-test", EXPO_PUBLIC_API_BASE_URL: "https://joyride-safety-test-api.onrender.com" };
    assert.equal(api(test), test.EXPO_PUBLIC_API_BASE_URL); assert.throws(() => api({}));
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "JoyRide-production-web-"));
    fs.writeFileSync(path.join(temporary, "index.html"), "fixture"); fs.writeFileSync(path.join(temporary, "bundle.js"), env.EXPO_PUBLIC_API_BASE_URL);
    core.verifyExport(temporary, env, false); assert.throws(() => core.settings(env, true));
    const complete = { ...env, JOYRIDE_PRODUCTION_WEB_MAPS_KEY: syntheticKey };
    core.writeConfig(temporary, complete); core.verifyExport(temporary, complete, true);
    assert.throws(() => core.verifyExport(temporary, { ...complete, EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN: "https://different.invalid" }, true));
    fs.writeFileSync(path.join(temporary, "leak.js"), syntheticKey); assert.throws(() => core.verifyExport(temporary, complete, true)); fs.unlinkSync(path.join(temporary, "leak.js"));
    fs.writeFileSync(path.join(temporary, "test.js"), test.EXPO_PUBLIC_API_BASE_URL); assert.throws(() => core.verifyExport(temporary, complete, true));
    await mapProbe({}, {}, env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, true);
    await mapProbe({}, {}, "https://different.invalid", false);
    await mapProbe({}, { safetyTest: true }, env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, false);
    await mapProbe({}, { origin: "https://different.invalid" }, env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, false);
    await mapProbe({}, { key: "invalid" }, env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, false);
    console.log("PASS: Production/test routing, native isolation, exact HTTPS origin, Maps provenance and export privacy regression checks.");
  } finally {
    keys.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch(() => { console.log("STOP: Production web contracts. Raw details withheld."); process.exitCode = 1; });
