const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
let passed = 0;

function parse(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const tree = ts.createSourceFile(
    file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  assert.equal(tree.parseDiagnostics.length, 0);
  return tree;
}
function one(tree, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(found.length, 1);
  return found[0];
}
function compile(source, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, ...globals,
  }, { timeout: 5000 });
  return module.exports;
}
async function test(name, action) {
  try {
    await action();
    passed++;
    console.log("PASS: " + name);
  } catch {
    console.log("FAIL: " + name);
    throw new Error("Visibility regression failed.");
  }
}
const plain = value => JSON.parse(JSON.stringify(value));

async function main() {
  const registry = parse("app/(tabs)/fleet-registry.tsx");
  function initializer(name) {
    return one(registry, node =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) && node.name.text === name
    ).initializer.getText(registry);
  }

  const selectRegistry = compile(
    "module.exports = (drivers, showDeactivatedDrivers) => {" +
    "const useMemo = callback => callback(); return (" +
    initializer("sortedDrivers") + ");};"
  );
  const selectChoices = compile(
    "module.exports = sortedDrivers => {" +
    "const useMemo = callback => callback(); return (" +
    initializer("vehicleChoiceDrivers") + ");};"
  );

  const drivers = [
    { id: "inactive", fullName: "Z Test", status: "INACTIVE" },
    { id: "approved", fullName: "B Test", status: "APPROVED" },
    { id: "suspended", fullName: "A Test", status: "SUSPENDED" },
    { id: "pending", fullName: "C Test", status: "PENDING" },
  ];
  await test("Default Registry hides only deactivated drivers", () => {
    assert.deepEqual(
      plain(selectRegistry(drivers, false).map(driver => driver.id)),
      ["suspended", "approved", "pending"]
    );
  });
  await test("Historical toggle reveals deactivated drivers", () => {
    assert.equal(selectRegistry(drivers, true).length, 4);
  });
  await test("Hiding historical drivers restores the normal list", () => {
    selectRegistry(drivers, true);
    assert.equal(selectRegistry(drivers, false).length, 3);
  });
  await test("Registry filtering preserves original records and ordering", () => {
    const before = JSON.stringify(drivers);
    selectRegistry(drivers, false);
    selectRegistry(drivers, true);
    assert.equal(JSON.stringify(drivers), before);
  });
  await test("Historical toggle cannot add inactive drivers to vehicle choices", () => {
    const choices = selectChoices(selectRegistry(drivers, true));
    assert.equal(choices.some(driver => driver.status === "INACTIVE"), false);
    assert.equal(choices.length, 3);
  });

  let reply;
  let calls = 0;
  const serviceSource = fs.readFileSync(
    path.join(root, "services/fleet-locations.ts"), "utf8"
  );
  const service = compile(serviceSource, {
    require(name) {
      assert.equal(name, "@/services/admin-auth");
      return {
        adminFetch: async () => { calls++; return reply; },
      };
    },
  });
  const locations = drivers.map((driver, index) => ({
    id: "sample-" + index, driverId: driver.id,
    driver: { ...driver, isOnline: false, isAvailable: false },
  }));
  reply = { ok: true, json: async () => locations };

  await test("Shared fleet loader excludes inactive driver markers", async () => {
    const result = await service.loadFleetLocations();
    assert.deepEqual(plain(result.map(item => item.driverId)),
      ["approved", "suspended", "pending"]);
  });
  await test("Other offline and suspended drivers retain existing visibility", async () => {
    const result = await service.loadFleetLocations();
    assert.equal(result.length, 3);
    assert.equal(result.every(item => !item.driver.isOnline), true);
  });
  await test("Fleet filtering does not delete or modify stored response data", async () => {
    const before = JSON.stringify(locations);
    await service.loadFleetLocations();
    assert.equal(JSON.stringify(locations), before);
  });
  await test("Empty fleet response clears the visible fleet", async () => {
    reply = { ok: true, json: async () => [] };
    assert.equal((await service.loadFleetLocations()).length, 0);
  });
  await test("Fleet request failures remain errors rather than empty success", async () => {
    reply = { ok: false, json: async () => ({ message: "Synthetic failure" }) };
    await assert.rejects(service.loadFleetLocations());
  });
  assert.ok(calls > 0);

  const live = parse("app/(tabs)/live-fleet.tsx");
  function cleanup(name) {
    const call = one(live, node =>
      ts.isCallExpression(node) &&
      node.expression.getText(live) === name &&
      node.arguments.length === 1 &&
      ts.isArrowFunction(node.arguments[0])
    );
    return compile(
      "module.exports = (current, fleetData) => (" +
      call.arguments[0].getText(live) + ")(current);"
    );
  }
  const selection = cleanup("setSelectedDriverId");
  const baseline = cleanup("setGpsBaseline");
  const fleet = [{ driverId: "approved" }];

  await test("Removed selected driver clears map selection", () => {
    assert.equal(selection("inactive", fleet), null);
  });
  await test("Remaining selected driver stays selected", () => {
    assert.equal(selection("approved", fleet), "approved");
  });
  await test("Removed driver clears its GPS baseline", () => {
    assert.equal(baseline({ driverId: "inactive" }, fleet), null);
  });
  await test("Remaining driver retains its GPS baseline", () => {
    const current = { driverId: "approved" };
    assert.equal(baseline(current, fleet), current);
  });
  await test("Empty fleet clears selection and baseline", () => {
    assert.equal(selection("approved", []), null);
    assert.equal(baseline({ driverId: "approved" }, []), null);
  });

  console.log("Passed visibility tests:", passed);
  console.log("No production requests or real locations used.");
}
main().catch(() => {
  console.log("STOP: Visibility regression failed; raw details withheld.");
  process.exitCode = 1;
});
