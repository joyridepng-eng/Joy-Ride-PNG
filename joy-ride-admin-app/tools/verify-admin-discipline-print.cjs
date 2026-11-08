const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
let passed = 0;
let currentHarness = null;

const react = {
  useState(initial) {
    const h = currentHarness;
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = initial;
    return [h.slots[index], value => {
      h.slots[index] = typeof value === "function"
        ? value(h.slots[index]) : value;
    }];
  },
  useRef(initial) {
    const h = currentHarness;
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = { current: initial };
    return h.slots[index];
  },
};
const jsx = (type, props) => ({ type, props: props || {} });

function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) {
        return mocks[name];
      }
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native") return {
        View: "View", Text: "Text", TouchableOpacity: "Button",
        StyleSheet: { create: value => value },
      };
      throw new Error("Unexpected test import.");
    },
    ...globals,
  };
  vm.runInNewContext(output, context, { filename, timeout: 5000 });
  return module.exports;
}

function harness(Component, props) {
  const h = { cursor: 0, slots: [], tree: null, props };
  h.render = () => {
    h.cursor = 0;
    currentHarness = h;
    try { h.tree = Component(h.props); }
    finally { currentHarness = null; }
    return h.tree;
  };
  h.render();
  return h;
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}
function button(h, label) {
  const found = nodes(h.tree).find(node =>
    node.type === "Button" && text(node) === label
  );
  assert.ok(found, "Expected action button.");
  return found;
}
async function press(h, label) {
  button(h, label).props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  h.render();
}
async function test(name, action) {
  try {
    await action();
    passed++;
    console.log("PASS: " + name);
  } catch {
    console.log("FAIL: " + name);
    throw new Error("Regression check failed.");
  }
}

async function main() {
  const receipt = load("services/settlement-receipt.ts");
  const sample = {
    id: "synthetic-ride",
    riderName: "Test Customer",
    pickupLabel: "Test pickup",
    pickupAddress: null,
    dropoffLabel: "Test destination",
    dropoffAddress: null,
    updatedAt: "2026-10-16T02:00:00.000Z",
    driver: { fullName: "Test Driver" },
    vehicle: { plateNumber: "TEST-ONLY" },
    settlement: {
      receiptNumber: "TEST-RECEIPT",
      finalFare: "25.50", driverShare: "20.40", companyShare: "5.10",
      status: "PENDING",
      createdAt: "2026-10-16T01:00:00.000Z",
    },
  };

  await test("Receipt contains the selected settlement and exact amounts", () => {
    const html = receipt.buildSettlementReceiptHtml(sample);
    for (const value of [
      "TEST-RECEIPT", "synthetic-ride", "PGK 25.50",
      "PGK 20.40", "PGK 5.10", "Test Driver", "TEST-ONLY"
    ]) assert.ok(html.includes(value));
  });
  await test("Pending receipt remains pending without changing its data", () => {
    const before = JSON.stringify(sample);
    const html = receipt.buildSettlementReceiptHtml(sample);
    assert.ok(html.includes("PENDING"));
    assert.equal(JSON.stringify(sample), before);
  });
  await test("Paid receipt displays paid status", () => {
    const html = receipt.buildSettlementReceiptHtml({
      ...sample, settlement: { ...sample.settlement, status: "PAID" },
    });
    assert.ok(html.includes("PAID"));
  });
  await test("Customer and route HTML cannot inject markup", () => {
    const html = receipt.buildSettlementReceiptHtml({
      ...sample,
      riderName: '<img src=x onerror="synthetic">',
      pickupLabel: "<script>synthetic</script>",
    });
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<script"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&quot;synthetic&quot;"));
  });
  await test("Missing settlements are rejected", () => {
    assert.throws(() => receipt.buildSettlementReceiptHtml({
      ...sample, settlement: null,
    }));
  });
  await test("Invalid and negative amounts are rejected", () => {
    for (const value of ["", "invalid", "-1", Infinity, NaN]) {
      assert.throws(() => receipt.buildSettlementReceiptHtml({
        ...sample,
        settlement: { ...sample.settlement, finalFare: value },
      }));
    }
  });
  await test("Invalid dates are rejected", () => {
    assert.throws(() => receipt.buildSettlementReceiptHtml({
      ...sample,
      settlement: { ...sample.settlement, createdAt: "invalid" },
    }));
  });
  await test("Receipt dates identify Port Moresby timezone", () => {
    const html = receipt.buildSettlementReceiptHtml(sample);
    assert.ok(html.includes("Port Moresby, UTC+10"));
    assert.ok(html.includes("11:00"));
  });

  let nativeHtml = null;
  const native = load("services/settlement-print.ts", {
    "expo-print": { printAsync: async options => { nativeHtml = options.html; } },
    "./settlement-receipt": receipt,
  });
  await test("Native printing receives only the selected receipt HTML", async () => {
    await native.printSettlementReceipt(sample);
    assert.equal(nativeHtml, receipt.buildSettlementReceiptHtml(sample));
  });

  let popupHtml = "";
  let printCalls = 0;
  const popup = {
    opener: {},
    document: {
      open() {}, write(value) { popupHtml = value; }, close() {},
    },
    focus() {}, print() { printCalls++; }, close() {},
  };
  const web = load("services/settlement-print.web.ts", {
    "./settlement-receipt": receipt,
  }, { window: { open: () => popup } });

  await test("Web prints a separate receipt and removes opener access", async () => {
    await web.printSettlementReceipt(sample);
    assert.equal(printCalls, 1);
    assert.equal(popup.opener, null);
    assert.equal(popupHtml, receipt.buildSettlementReceiptHtml(sample));
  });
  await test("Blocked web receipt windows return a recoverable error", async () => {
    const blocked = load("services/settlement-print.web.ts", {
      "./settlement-receipt": receipt,
    }, { window: { open: () => null } });
    await assert.rejects(blocked.printSettlementReceipt(sample));
  });

  const Actions = load("components/driver-discipline-actions.tsx").default;
  const driver = { id: "synthetic-driver", fullName: "Test Driver", status: "APPROVED" };
  const base = { driver, disabled: false, onSubmit: async () => true };

  await test("Approved driver offers both actions without submitting", () => {
    let calls = 0;
    const h = harness(Actions, {
      ...base, onSubmit: async () => { calls++; return true; },
    });
    button(h, "Suspend Driver");
    button(h, "Deactivate Driver");
    assert.equal(calls, 0);
  });
  await test("Cancel leaves driver status unchanged", async () => {
    let calls = 0;
    const h = harness(Actions, {
      ...base, onSubmit: async () => { calls++; return true; },
    });
    await press(h, "Suspend Driver");
    button(h, "Confirm Suspend");
    await press(h, "Cancel");
    assert.equal(calls, 0);
    assert.ok(!text(h.tree).includes("Confirm Suspend"));
  });
  await test("Suspend confirmation submits SUSPENDED for the selected driver", async () => {
    let received = null;
    const h = harness(Actions, {
      ...base, onSubmit: async (record, status) => {
        received = [record.id, status]; return true;
      },
    });
    await press(h, "Suspend Driver");
    await press(h, "Confirm Suspend");
    assert.deepEqual(received, ["synthetic-driver", "SUSPENDED"]);
  });
  await test("Deactivate confirmation submits INACTIVE", async () => {
    let received = null;
    const h = harness(Actions, {
      ...base, onSubmit: async (record, status) => {
        received = [record.id, status]; return true;
      },
    });
    await press(h, "Deactivate Driver");
    await press(h, "Confirm Deactivate");
    assert.deepEqual(received, ["synthetic-driver", "INACTIVE"]);
  });
  await test("Rejected status change retains confirmation for retry", async () => {
    const h = harness(Actions, { ...base, onSubmit: async () => false });
    await press(h, "Suspend Driver");
    await press(h, "Confirm Suspend");
    button(h, "Confirm Suspend");
  });
  await test("Pending status change prevents duplicate submissions", async () => {
    let calls = 0;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const h = harness(Actions, {
      ...base, onSubmit: async () => { calls++; return pending; },
    });
    await press(h, "Suspend Driver");
    const confirm = button(h, "Confirm Suspend");
    confirm.props.onPress();
    confirm.props.onPress();
    assert.equal(calls, 1);
    finish(true);
    await Promise.resolve();
    await Promise.resolve();
  });
  await test("Disabled controls cannot submit a status change", async () => {
    let calls = 0;
    const h = harness(Actions, {
      ...base, disabled: true,
      onSubmit: async () => { calls++; return true; },
    });
    assert.equal(button(h, "Suspend Driver").props.disabled, true);
    await press(h, "Suspend Driver");
    await press(h, "Confirm Suspend");
    assert.equal(calls, 0);
  });
  await test("Suspended drivers can be deactivated without duplicate suspension", () => {
    const h = harness(Actions, {
      ...base, driver: { ...driver, status: "SUSPENDED" },
    });
    button(h, "Deactivate Driver");
    assert.ok(!nodes(h.tree).some(node =>
      node.type === "Button" && text(node) === "Suspend Driver"
    ));
  });
  await test("Inactive drivers have no duplicate discipline actions", () => {
    const h = harness(Actions, {
      ...base, driver: { ...driver, status: "INACTIVE" },
    });
    assert.equal(nodes(h.tree).filter(node => node.type === "Button").length, 0);
  });

  console.log("Passed Admin action tests:", passed);
  console.log("No production requests, customer data, or printer connections used.");
}

main().catch(() => {
  console.log("STOP: Admin action regression check failed; raw details withheld.");
  process.exitCode = 1;
});
