const fs = require("node:fs");
const path = require("node:path");
const { validOrigin } = require("../config/with-production-web.cjs");
const { listFiles, blockedFile } = require("./admin-safety-web-utils.cjs");
const API = "https://explore-png-api.onrender.com";
function check(value) { if (!value) throw new Error("Production web guard failed."); }
function settings(env, requireKey) {
  check(env.EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION === "1");
  check(!env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST && !env.EXPO_PUBLIC_JOYRIDE_VARIANT);
  check(env.EXPO_PUBLIC_API_BASE_URL === API && env.EXPO_NO_DOTENV === "1");
  check(!env.EAS_BUILD_PROFILE && env.EAS_BUILD !== "true");
  check(!env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY && !env.EXPO_PUBLIC_SAFETY_TEST_GOOGLE_MAPS_API_KEY);
  check(validOrigin(env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN));
  if (requireKey) check(typeof env.JOYRIDE_PRODUCTION_WEB_MAPS_KEY === "string" && /^AIza[0-9A-Za-z_-]{35}$/.test(env.JOYRIDE_PRODUCTION_WEB_MAPS_KEY));
  return { origin: env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN, api: API };
}
function verifyExport(folder, env, requireConfig) {
  const config = settings(env, requireConfig);
  const names = listFiles(folder);
  check(names.includes("index.html") && names.length > 1);
  let apiFound = false;
  for (const name of names) {
    check(!blockedFile(name) && !name.endsWith(".map"));
    const data = fs.readFileSync(path.join(folder, name));
    if (/\.(?:js|json|html|css|txt)$/.test(name) || name === "__joyride/maps-config") {
      const text = data.toString("utf8");
      check(!text.includes("joyride-safety-test-api.onrender.com"));
      if (text.includes(API)) apiFound = true;
      if (name !== "__joyride/maps-config") check(!/AIza[0-9A-Za-z_-]{35}/.test(text));
    }
  }
  check(apiFound);
  if (requireConfig) {
    const runtime = JSON.parse(fs.readFileSync(path.join(folder, "__joyride/maps-config"), "utf8"));
    check(JSON.stringify(runtime) === JSON.stringify({ production: true, safetyTest: false, origin: config.origin, key: env.JOYRIDE_PRODUCTION_WEB_MAPS_KEY }));
  } else check(!names.includes("__joyride/maps-config"));
  return names.length;
}
function writeConfig(folder, env) {
  const { origin } = settings(env, true);
  verifyExport(folder, env, false);
  const target = path.join(folder, "__joyride/maps-config");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ production: true, safetyTest: false, origin, key: env.JOYRIDE_PRODUCTION_WEB_MAPS_KEY }) + "\n", { flag: "wx" });
  verifyExport(folder, env, true);
}
module.exports = { settings, verifyExport, writeConfig };
