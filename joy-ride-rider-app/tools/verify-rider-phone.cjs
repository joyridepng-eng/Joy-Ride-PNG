const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(
  path.dirname(require.resolve("./verify-rider-phone.cjs")),
  "..",
);
let stage = "Phone formatting";
let passed = 0;
function compile(source, context) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  vm.runInNewContext(output, context, { timeout: 5000 });
}
const helper = { exports: {} };
compile(
  fs.readFileSync(path.join(root, "services/png-rider-phone.ts"), "utf8"),
  {
    module: helper,
    exports: helper.exports,
  },
);
const { formatPngRiderPhone, normalizePngRiderPhone } = helper.exports;
function check(name, action) {
  stage = name;
  action();
  passed++;
}
function handler(file, name, input) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.equal(sf.parseDiagnostics.length, 0);
  const nodes = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sf);
  assert.equal(nodes.length, 1);
  const calls = [],
    messages = [],
    submitting = [],
    routes = [];
  const exports = {};
  const context = {
    ...input,
    normalizePngRiderPhone,
    formatPngRiderPhone,
    setErrorMessage: (value) => messages.push(value),
    setIsSubmitting: (value) => submitting.push(value),
    signIn: async (...args) => calls.push(args),
    register: async (value) => calls.push(value),
    router: { replace: (value) => routes.push(value) },
    RiderAuthenticationError: class extends Error {},
    exports,
  };
  compile(
    ts.createPrinter().printNode(ts.EmitHint.Unspecified, nodes[0], sf) +
      "\nexports.run = " +
      name +
      ";",
    context,
  );
  return { run: exports.run, calls, messages, submitting, routes };
}
async function main() {
  for (const value of [
    "70000000",
    "7000 0000",
    "+67570000000",
    "+675 7000 0000",
    "0067570000000",
    "67570000000",
    "(7000) 0000",
  ]) {
    check("Accepted PNG input variant", () =>
      assert.equal(normalizePngRiderPhone(value), "+67570000000"),
    );
  }
  for (const value of ["", "700", "+6170000000", "700000000", "7000abc0"]) {
    check("Invalid input rejected", () =>
      assert.equal(normalizePngRiderPhone(value), null),
    );
  }
  check("Local digits display with spacing", () =>
    assert.equal(formatPngRiderPhone("70000000"), "7000 0000"),
  );
  const password = "SyntheticPassword123!";
  for (const value of ["7000 0000", "+675 7000 0000"]) {
    stage = "Login submits one canonical phone number";
    const test = handler("app/login.tsx", "handleSignIn", {
      phone: value,
      password,
    });
    await test.run();
    assert.equal(test.calls.length, 1);
    assert.equal(test.calls[0][0], "+67570000000");
    assert.equal(test.calls[0][1], password);
    assert.equal(test.routes[0], "/");
    assert.equal(test.submitting.at(-1), false);
    passed++;
  }
  stage = "Invalid phone prevents login request";
  const badLogin = handler("app/login.tsx", "handleSignIn", {
    phone: "700",
    password,
  });
  await badLogin.run();
  assert.equal(badLogin.calls.length, 0);
  assert.ok(badLogin.messages.length);
  passed++;
  const registration = {
    fullName: "Synthetic Rider",
    phone: "+675 7000 0000",
    email: "",
    password,
    confirmPassword: password,
  };
  stage = "Registration preserves credentials and normalizes phone";
  const good = handler("app/register.tsx", "handleRegistration", registration);
  await good.run();
  assert.equal(good.calls.length, 1);
  assert.equal(good.calls[0].phone, "+67570000000");
  assert.equal(good.calls[0].fullName, registration.fullName);
  assert.equal(good.calls[0].password, password);
  assert.equal(good.calls[0].email, undefined);
  assert.equal(good.routes[0], "/");
  passed++;
  for (const change of [
    { phone: "700" },
    { password: "short", confirmPassword: "short" },
    { confirmPassword: "different" },
  ]) {
    stage = "Invalid registration prevents request";
    const bad = handler("app/register.tsx", "handleRegistration", {
      ...registration,
      ...change,
    });
    await bad.run();
    assert.equal(bad.calls.length, 0);
    assert.ok(bad.messages.length);
    passed++;
  }
  console.log(
    "PASS: Rider phone formatting and actual authentication handlers.",
  );
  console.log("Passed checks:", passed);
  console.log("Synthetic inputs and mocked authentication only; no requests.");
}
main().catch(() => {
  console.log("STOP: Phone regression: " + stage);
  process.exitCode = 1;
});
