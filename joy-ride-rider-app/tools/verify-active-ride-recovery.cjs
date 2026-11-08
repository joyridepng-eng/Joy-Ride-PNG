const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

let passed = 0;
const watchdog = setTimeout(() => {
  console.log("STOP: Client tests timed out; raw details withheld.");
  process.exit(1);
}, 30000);

function load(file, dependencies, timers = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error("Unexpected test dependency");
      return dependencies[name];
    },
    AbortController,
    setTimeout: timers.setTimeout || setTimeout,
    clearTimeout: timers.clearTimeout || clearTimeout,
  }, { filename: file });
  return exports;
}

const sessionA = { rider: { id: "fixture-a" }, accessToken: "fixture-token-a" };
const sessionB = { rider: { id: "fixture-b" }, accessToken: "fixture-token-b" };

function service({ data = null, ok = true, sessions = [sessionA], fetch, timers } = {}) {
  let reads = 0;
  let calls = 0;
  const module = load("services/rider-active-ride.ts", {
    "./rider-session": {
      loadRiderSession: async () => sessions[Math.min(reads++, sessions.length - 1)],
    },
    "./rider-auth": {
      riderFetch: async (...args) => {
        calls++;
        if (fetch) return fetch(...args);
        return { ok, json: async () => data };
      },
    },
  }, timers);
  return { read: module.fetchActiveRiderRide, calls: () => calls };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function hookHarness() {
  const cells = [];
  let cursor = 0, focusCallback, sessionCallback;
  const listeners = new Set();
  const calls = [];

  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = initial;
      return [cells[index], value => {
        cells[index] = typeof value === "function" ? value(cells[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const old = cells[index];
      if (!old || dependencies.some((value, i) => value !== old.dependencies[i])) {
        cells[index] = { callback, dependencies };
      }
      return cells[index].callback;
    },
  };

  const module = load("hooks/use-active-rider-ride.ts", {
    react,
    "react-native": {
      AppState: {
        addEventListener(_name, callback) {
          listeners.add(callback);
          return { remove: () => listeners.delete(callback) };
        },
      },
    },
    "expo-router": {
      useFocusEffect(callback) { focusCallback = callback; },
    },
    "../services/rider-active-ride": {
      fetchActiveRiderRide(signal) {
        const request = deferred();
        calls.push({ ...request, signal });
        return request.promise;
      },
    },
    "../services/rider-session": {
      subscribeToRiderSession(callback) {
        sessionCallback = callback;
        return () => { sessionCallback = undefined; };
      },
    },
  });

  function render() {
    cursor = 0;
    return module.useActiveRiderRide();
  }
  render();

  return {
    render, calls,
    focus: () => focusCallback(),
    appState: state => listeners.forEach(callback => callback(state)),
    sessionChanged: () => sessionCallback(),
    listenerCount: () => listeners.size,
  };
}

async function test(name, action) {
  await action();
  passed++;
  console.log("PASS:", name);
}

async function main() {
  for (const status of ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"]) {
    await test("Recovers " + status, async () => {
      const result = await service({ data: { id: "fixture-ride", status } }).read();
      assert.equal(result.id, "fixture-ride");
      assert.equal(result.status, status);
    });
  }

  await test("Null response means no active ride", async () => {
    assert.equal(await service().read(), null);
  });

  await test("HTTP failure is not treated as no active ride", async () => {
    await assert.rejects(() => service({ ok: false }).read());
  });

  await test("Network failure blocks recovery", async () => {
    await assert.rejects(() => service({
      fetch: async () => { throw new Error("Synthetic network failure"); },
    }).read());
  });

  for (const status of ["COMPLETED", "CANCELLED", "NO_DRIVER_AVAILABLE"]) {
    await test("Rejects terminal active-response status " + status, async () => {
      await assert.rejects(() => service({
        data: { id: "fixture-ride", status },
      }).read());
    });
  }

  await test("Malformed response is rejected", async () => {
    await assert.rejects(() => service({
      data: { id: "", status: "REQUESTED" },
    }).read());
  });

  await test("Signed-out account does not send a ride request", async () => {
    const subject = service({ sessions: [null] });
    await assert.rejects(() => subject.read());
    assert.equal(subject.calls(), 0);
  });

  await test("Account change rejects the previous account response", async () => {
    await assert.rejects(() => service({
      data: { id: "fixture-ride", status: "REQUESTED" },
      sessions: [sessionA, sessionB],
    }).read());
  });

  await test("Token change rejects an obsolete response", async () => {
    await assert.rejects(() => service({
      data: { id: "fixture-ride", status: "REQUESTED" },
      sessions: [sessionA, { ...sessionA, accessToken: "fixture-replacement" }],
    }).read());
  });

  await test("Aborted recovery cannot restore a ride", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => service({
      data: { id: "fixture-ride", status: "REQUESTED" },
    }).read(controller.signal));
  });

  await test("Timeout aborts the request", async () => {
    let trigger, requestStarted;
    const started = new Promise(resolve => { requestStarted = resolve; });
    const subject = service({
      timers: {
        setTimeout(callback) { trigger = callback; return 1; },
        clearTimeout() {},
      },
      fetch: async (_path, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("Synthetic abort")));
        requestStarted();
      }),
    });
    const result = subject.read();
    const rejected = assert.rejects(() => result);
    await started;
    trigger();
    await rejected;
  });

  await test("Focus recovers a ride and foreground refresh updates it", async () => {
    const hook = hookHarness();
    const cleanup = hook.focus();
    assert.equal(hook.calls.length, 1);
    hook.calls[0].resolve({ id: "fixture-ride", status: "REQUESTED" });
    await settle();
    assert.equal(hook.render().state.phase, "active");

    hook.appState("background");
    assert.equal(hook.calls.length, 1);
    hook.appState("active");
    assert.equal(hook.render().state.phase, "checking");
    hook.calls[1].resolve({ id: "fixture-ride", status: "IN_PROGRESS" });
    await settle();
    assert.equal(hook.render().state.ride.status, "IN_PROGRESS");
    cleanup();
    assert.equal(hook.listenerCount(), 0);
  });

  await test("Lookup failure shows retry state instead of allowing booking", async () => {
    const hook = hookHarness();
    const cleanup = hook.focus();
    hook.calls[0].reject(new Error("Synthetic lookup failure"));
    await settle();
    assert.equal(hook.render().state.phase, "error");
    cleanup();
  });

  await test("Account change discards a late previous response", async () => {
    const hook = hookHarness();
    const cleanup = hook.focus();
    hook.sessionChanged();
    assert.equal(hook.calls[0].signal.aborted, true);
    hook.calls[1].resolve({ id: "fixture-new", status: "ACCEPTED" });
    await settle();
    hook.calls[0].resolve({ id: "fixture-old", status: "REQUESTED" });
    await settle();
    assert.equal(hook.render().state.ride.id, "fixture-new");
    cleanup();
  });

  await test("Leaving the screen aborts and discards pending recovery", async () => {
    const hook = hookHarness();
    const cleanup = hook.focus();
    cleanup();
    assert.equal(hook.calls[0].signal.aborted, true);
    hook.calls[0].resolve({ id: "fixture-late", status: "REQUESTED" });
    await settle();
    assert.notEqual(hook.render().state.phase, "active");
  });

  console.log("PASS: Client recovery tests completed.");
  console.log("Passed client tests:", passed);
}

main().catch(() => {
  console.log("STOP: Client recovery test failed; raw details withheld.");
  process.exitCode = 1;
}).finally(() => clearTimeout(watchdog));