"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.dirname(require.resolve("../package.json"));
const file = path.join(root, "app/(tabs)/daily-takings.tsx");
const source = fs.readFileSync(file, "utf8");
const tree = ts.createSourceFile(
  file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
);
assert.equal(tree.parseDiagnostics.length, 0);

const screen = tree.statements.find(node =>
  ts.isFunctionDeclaration(node) &&
  node.name?.text === "DailyTakingsScreen"
);
assert.ok(screen?.body);

const stateSlots = new Map();
let hookIndex = 0;
for (const statement of screen.body.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    const call = declaration.initializer;
    if (!call || !ts.isCallExpression(call) ||
        !ts.isIdentifier(call.expression)) continue;
    if (!["useState", "useRef", "useCallback"]
      .includes(call.expression.text)) continue;

    if (call.expression.text === "useState" &&
        ts.isArrayBindingPattern(declaration.name)) {
      stateSlots.set(declaration.name.elements[0].name.text, hookIndex);
    }
    hookIndex++;
  }
}
for (const name of ["selectedDate", "statement", "isLoading", "today"]) {
  assert.ok(stateSlots.has(name));
}

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX
  }
}).outputText;

function statement(date, label) {
  return {
    statementNumber: label,
    statementDate: date,
    timezone: "Pacific/Port_Moresby",
    statementStatus: "PROVISIONAL",
    range: { from: "", toExclusive: "" },
    generatedAt: "",
    summary: {
      completedTrips: 0,
      grossTakings: 0,
      driverOwnerShare: 0,
      companyShare: 0,
      driverSharePercent: 80,
      companySharePercent: 20,
      pendingReconciliation: 0,
      reconciled: 0
    },
    receipts: []
  };
}

function createHarness(start = "2026-10-18T02:00:00.000Z") {
  let now = Date.parse(start);
  let index = 0;
  let dirty = false;
  let mounted = true;
  let focused = true;
  let nextEffect;
  let activeEffect;
  let cleanup;
  let timerId = 0;
  const hooks = [];
  const timers = new Map();
  const listeners = new Set();
  const requests = [];

  function same(a, b) {
    return a && b && a.length === b.length &&
      a.every((value, position) => Object.is(value, b[position]));
  }

  const react = {
    useState(initial) {
      const position = index++;
      if (!hooks[position]) {
        const slot = {
          value: typeof initial === "function" ? initial() : initial
        };
        slot.set = next => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) {
            slot.value = value;
            dirty = true;
          }
        };
        hooks[position] = slot;
      }
      return [hooks[position].value, hooks[position].set];
    },
    useRef(initial) {
      const position = index++;
      if (!hooks[position]) hooks[position] = { current: initial };
      return hooks[position];
    },
    useCallback(callback, dependencies) {
      const position = index++;
      if (!hooks[position] ||
          !same(hooks[position].dependencies, dependencies)) {
        hooks[position] = { callback, dependencies };
      }
      return hooks[position].callback;
    }
  };

  const appState = {
    currentState: "active",
    addEventListener(event, listener) {
      assert.equal(event, "change");
      listeners.add(listener);
      return { remove() { listeners.delete(listener); } };
    }
  };

  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(now);
    }
    static now() { return now; }
  }

  const moduleObject = { exports: {} };
  const jsx = (type, props) => ({ type, props });

  function mockedRequire(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") {
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (name === "expo-router") {
      return { useFocusEffect(callback) { nextEffect = callback; } };
    }
    if (name === "@/services/driver-auth") {
      return {
        driverFetch(url) {
          let resolve;
          let reject;
          const promise = new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          });
          requests.push({ url: String(url), resolve, reject });
          return promise;
        }
      };
    }
    if (name === "react-native") {
      return {
        AppState: appState,
        StyleSheet: {
          create: value => value,
          hairlineWidth: 1
        },
        ActivityIndicator: "ActivityIndicator",
        RefreshControl: "RefreshControl",
        ScrollView: "ScrollView",
        Text: "Text",
        TouchableOpacity: "TouchableOpacity",
        View: "View"
      };
    }
    throw new Error("Unexpected screen dependency");
  }

  const context = {
    module: moduleObject,
    exports: moduleObject.exports,
    require: mockedRequire,
    Date: FakeDate,
    URLSearchParams,
    setInterval(callback, milliseconds) {
      const id = ++timerId;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearInterval(id) { timers.delete(id); }
  };
  vm.runInNewContext(compiled, context, { filename: "takings-screen.js" });

  function render() {
    assert.ok(mounted);
    index = 0;
    dirty = false;
    nextEffect = undefined;
    moduleObject.exports.default();

    if (focused && nextEffect !== activeEffect) {
      if (cleanup) cleanup();
      activeEffect = nextEffect;
      cleanup = nextEffect();
    }
  }

  async function drain() {
    for (let turn = 0; turn < 20; turn++) {
      await Promise.resolve();
      if (mounted && dirty) render();
    }
  }

  function state(name) {
    return hooks[stateSlots.get(name)].value;
  }

  function visitElements(element, callback) {
    if (element == null || typeof element !== "object") return;
    if (Array.isArray(element)) {
      element.forEach(child => visitElements(child, callback));
      return;
    }
    callback(element);
    visitElements(element.props?.children, callback);
  }

  return {
    requests, timers, listeners, render, drain, state,
    setTime(value) { now = Date.parse(value); },
    async select(date) {
      hooks[stateSlots.get("selectedDate")].set(date);
      await drain();
    },
    async reply(position, value, ok = true) {
      requests[position].resolve({
        ok,
        json: async () => value
      });
      await drain();
    },
    async fail(position) {
      requests[position].reject(new Error("Synthetic request failure"));
      await drain();
    },
    async tick() {
      for (const timer of [...timers.values()]) timer.callback();
      await drain();
    },
    async app(value) {
      appState.currentState = value;
      for (const listener of [...listeners]) listener(value);
      await drain();
    },
    blur() {
      focused = false;
      if (cleanup) cleanup();
      cleanup = undefined;
      activeEffect = undefined;
    },
    async focus() {
      focused = true;
      render();
      await drain();
    },
    unmount() {
      if (cleanup) cleanup();
      mounted = false;
      cleanup = undefined;
    },
    async pullRefresh() {
      index = 0;
      nextEffect = undefined;
      const element = moduleObject.exports.default();
      let action;
      visitElements(element, node => {
        if (node.type === "ScrollView") {
          action = node.props.refreshControl?.props?.onRefresh;
        }
      });
      assert.equal(typeof action, "function");
      action();
      await drain();
    }
  };
}

function requestDate(request) {
  const match = request.url.match(/[?&]date=([^&]+)/);
  assert.ok(match, "Expected authenticated daily request with date");
  return decodeURIComponent(match[1]);
}

let passed = 0;
let currentTest = "Preparing regression tests";

async function test(name, action) {
  currentTest = name;
  await action();
  passed++;
  console.log("PASS:", name);
}

async function main() {
  await test("Focus loads the selected Port Moresby day", async () => {
    const h = createHarness();
    h.render();
    await h.drain();
    assert.equal(h.requests.length, 1);
    assert.equal(requestDate(h.requests[0]), "2026-10-18");
    await h.reply(0, statement("2026-10-18", "first"));
    assert.equal(h.state("statement").statementNumber, "first");
    h.unmount();
  });

  await test("Visible Takings refreshes every fifteen seconds", async () => {
    const h = createHarness();
    h.render();
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].milliseconds, 15000);
    await h.reply(0, statement("2026-10-18", "first"));
    await h.tick();
    assert.equal(h.requests.length, 2);
    await h.reply(1, statement("2026-10-18", "updated"));
    assert.equal(h.state("statement").statementNumber, "updated");
    h.unmount();
  });

  await test("Polling and manual refresh do not overlap a pending request", async () => {
    const h = createHarness();
    h.render();
    await h.tick();
    await h.tick();
    await h.pullRefresh();
    assert.equal(h.requests.length, 1);
    await h.reply(0, statement("2026-10-18", "first"));
    await h.pullRefresh();
    assert.equal(h.requests.length, 2);
    h.unmount();
  });

  await test("Backgrounding pauses polling and foreground resumes immediately", async () => {
    const h = createHarness();
    h.render();
    await h.reply(0, statement("2026-10-18", "first"));
    await h.app("background");
    await h.tick();
    assert.equal(h.requests.length, 1);
    await h.app("active");
    assert.equal(h.requests.length, 2);
    h.unmount();
  });

  await test("Blur removes timers and listeners; focus reloads", async () => {
    const h = createHarness();
    h.render();
    await h.reply(0, statement("2026-10-18", "first"));
    h.blur();
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
    await h.tick();
    assert.equal(h.requests.length, 1);
    await h.focus();
    assert.equal(h.requests.length, 2);
    h.unmount();
  });

  await test("Midnight advances today's selection to the next local day", async () => {
    const h = createHarness("2026-10-18T13:59:59.000Z");
    h.render();
    await h.reply(0, statement("2026-10-18", "old-day"));
    h.setTime("2026-10-18T14:00:01.000Z");
    await h.tick();
    assert.equal(h.state("today"), "2026-10-19");
    assert.equal(h.state("selectedDate"), "2026-10-19");
    assert.equal(h.state("statement"), null);
    assert.equal(requestDate(h.requests.at(-1)), "2026-10-19");
    h.unmount();
  });

  await test("Historical selection remains selected across midnight", async () => {
    const h = createHarness("2026-10-18T13:59:59.000Z");
    h.render();
    await h.reply(0, statement("2026-10-18", "today"));
    await h.select("2026-10-17");
    await h.reply(1, statement("2026-10-17", "history"));
    h.setTime("2026-10-18T14:00:01.000Z");
    await h.tick();
    assert.equal(h.state("today"), "2026-10-19");
    assert.equal(h.state("selectedDate"), "2026-10-17");
    assert.equal(requestDate(h.requests.at(-1)), "2026-10-17");
    h.unmount();
  });

  await test("Returning from overnight background follows the new day", async () => {
    const h = createHarness("2026-10-18T13:59:59.000Z");
    h.render();
    await h.reply(0, statement("2026-10-18", "before"));
    await h.app("background");
    h.setTime("2026-10-19T00:00:00.000Z");
    await h.app("active");
    assert.equal(h.state("selectedDate"), "2026-10-19");
    assert.equal(requestDate(h.requests.at(-1)), "2026-10-19");
    h.unmount();
  });

  await test("Old date responses cannot replace a newer date statement", async () => {
    const h = createHarness();
    h.render();
    await h.select("2026-10-17");
    assert.equal(h.requests.length, 2);
    await h.reply(1, statement("2026-10-17", "new-selection"));
    await h.reply(0, statement("2026-10-18", "late-old-selection"));
    assert.equal(h.state("statement").statementNumber, "new-selection");
    assert.equal(h.state("isLoading"), false);
    h.unmount();
  });

  await test("Old request completion cannot release a newer pending request", async () => {
    const h = createHarness();
    h.render();
    await h.app("background");
    await h.app("active");
    assert.equal(h.requests.length, 2);
    await h.reply(0, statement("2026-10-18", "obsolete"));
    assert.equal(h.state("isLoading"), true);
    await h.tick();
    assert.equal(h.requests.length, 2);
    await h.reply(1, statement("2026-10-18", "current"));
    assert.equal(h.state("statement").statementNumber, "current");
    h.unmount();
  });

  await test("Failed requests release the refresh guard for retry", async () => {
    const h = createHarness();
    h.render();
    await h.fail(0);
    assert.equal(h.state("isLoading"), false);
    await h.tick();
    assert.equal(h.requests.length, 2);
    await h.reply(1, statement("2026-10-18", "recovered"));
    assert.equal(h.state("statement").statementNumber, "recovered");
    h.unmount();
  });

  await test("Unmount removes subscriptions and rejects late results", async () => {
    const h = createHarness();
    h.render();
    h.unmount();
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
    await h.reply(0, statement("2026-10-18", "late"));
    assert.equal(h.state("statement"), null);
  });

  console.log("Passed Takings refresh tests:", passed);
  console.log("Actual screen code tested with simulated lifecycle and clock.");
  console.log("No production requests, real receipts, or phone changes.");
}

main().catch(() => {
  console.log("STOP: Regression case: " + currentTest);
  console.log("Passed cases:", passed);
  console.log("Raw errors and source contents withheld.");
  process.exitCode = 1;
});