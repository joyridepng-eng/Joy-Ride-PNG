const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const file = path.join(__dirname, "../services/png-driver-phone.ts");
const source = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const target = { exports: {} };
vm.runInNewContext(compiled, { exports: target.exports, module: target });
const { formatPngDriverPhone, normalizePngDriverPhone } = target.exports;
for (const value of [
  "70000000",
  "7000 0000",
  "+67570000000",
  "+675 7000 0000",
  "0067570000000",
  "67570000000",
  "(7000) 0000",
]) {
  assert.equal(normalizePngDriverPhone(value), "+67570000000");
}
for (const value of ["", "700", "+6170000000", "700000000", "7000abc0"]) {
  assert.equal(normalizePngDriverPhone(value), null);
}
assert.equal(formatPngDriverPhone("70000000"), "7000 0000");
console.log("PASS: Thirteen PNG phone-input checks.");
