const path = require("node:path");
const fs = require("node:fs");
const cp = require("node:child_process");
const { settings, verifyExport, writeConfig } =
  require("./production-web-core.cjs");

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
let stage = "Arguments";

try {
  const keyFree = process.argv[2] === "--key-free-check";
  if (process.argv.length > (keyFree ? 3 : 2)) {
    throw new Error("Arguments refused.");
  }

  stage = "Production settings";
  settings(process.env, !keyFree);
  console.log("PASS: Production web settings guards.");

  stage = "Output directory precheck";
  const dist = path.join(root, "dist-production");
  if (fs.existsSync(dist)) {
    throw new Error("Output already exists; preserve it for review.");
  }

  stage = "Expo export";
  const result = cp.spawnSync(process.execPath, [
    path.join(root, "node_modules/expo/bin/cli"),
    "export", "--clear", "--platform", "web", "--output-dir", dist,
  ], {
    cwd: root,
    env: { ...process.env, EXPO_NO_TELEMETRY: "1" },
    encoding: "utf8",
    windowsHide: true,
    timeout: 600000,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    console.log("Export timed out:", result.error?.code === "ETIMEDOUT");
    console.log("Module resolution issue:",
      /Unable to resolve|Cannot find module|Module not found/i.test(output));
    console.log("Syntax or transform issue:",
      /SyntaxError|TransformError|Unexpected token/i.test(output));
    console.log("Configuration refusal:",
      /configuration refused|production.*refused/i.test(output));
    throw new Error("Export failed.");
  }
  console.log("PASS: Expo web export.");

  stage = "Export file guards";
  verifyExport(dist, process.env, false);
  console.log("PASS: Production export file guards.");

  if (!keyFree) {
    stage = "Runtime Maps configuration";
    writeConfig(dist, process.env);
  }

  console.log(keyFree
    ? "PASS: Key-free production web export; not ready for hosting."
    : "PASS: Production web export and exact-origin browser Maps configuration verified.");
} catch {
  console.log("STOP: Production web stage: " + stage + ".");
  console.log("Raw configuration, keys, and export logs withheld.");
  process.exitCode = 1;
}
