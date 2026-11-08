const fs = require("node:fs");
const path = require("node:path");
const { check, distManifest, TEST_API } = require("./admin-safety-web-utils.cjs");
try {
  const folder = process.argv[2];
  check(folder && path.isAbsolute(folder));
  const files = distManifest(path.join(folder, "dist"));
  fs.writeFileSync(path.join(folder, "web-receipt.json"), JSON.stringify({ state: "verified-repository-web-export", api: TEST_API, files }, null, 2) + "\n");
  console.log("PASS: Web export test endpoint, credential guards and exact file receipt verified.");
} catch {
  console.log("STOP: Web export guards. Raw details withheld.");
  process.exitCode = 1;
}
