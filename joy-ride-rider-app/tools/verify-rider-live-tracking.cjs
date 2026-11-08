const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

let currentTest = "Preparation";
let passed = 0;
const cleanups = new Set();
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};

function harness({ honorAbort = true } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let appListener;
  let sessionListener;
  let session = {
    rider: { id: "synthetic-rider" },
    accessToken: "synthetic-token",
  };
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const options = { rideId: "synthetic-ride", enabled: true };

  function memo(factory, dependencies) {
    const index = cursor++;
    const old = slots[index];
    if (!old || dependencies.some((value, n) =>
      !Object.is(value, old.dependencies[n]))) {
      slots[index] = { value: factory(), dependencies };
    }
    return slots[index].value;
  }

  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function"
          ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: initial } };
      return slots[index].ref;
    },
    useCallback: (callback, dependencies) => memo(() => callback, dependencies),
    useEffect(effect, dependencies) {
      const index = cursor++;
      const old = slots[index];
      if (!old || dependencies.some((value, n) =>
        !Object.is(value, old.dependencies[n]))) {
        slots[index] = { dependencies, dispose: old?.dispose };
        effects.push(() => {
          slots[index].dispose?.();
          slots[index].dispose = effect();
        });
      }
    },
  };

  const exports = {};
  const source = fs.readFileSync("hooks/use-ride-driver-location.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const addTimer = (callback, delay, interval) => {
    const id = ++timerId;
    timers.set(id, { callback, delay, interval });
    return id;
  };

  vm.runInNewContext(code, {
    exports, module: { exports }, AbortController,
    setInterval: (callback, delay) => addTimer(callback, delay, true),
    clearInterval: id => timers.delete(id),
    setTimeout: (callback, delay) => addTimer(callback, delay, false),
    clearTimeout: id => timers.delete(id),
    require(name) {
      if (name === "react") return react;
      if (name === "react-native") return {
        AppState: {
          currentState: "active",
          addEventListener(_name, listener) {
            appListener = listener;
            return { remove() { appListener = undefined; } };
          },
        },
      };
      if (name.includes("rider-session")) return {
        loadRiderSession: async () => session,
        subscribeToRiderSession(listener) {
          sessionListener = listener;
          return () => { sessionListener = undefined; };
        },
      };
      if (name.includes("rider-auth")) return {
        riderFetch(url, init) {
          return new Promise((resolve, reject) => {
            requests.push({ url, signal: init.signal, resolve });
            if (honorAbort) {
              const abort = () => {
                const error = new Error("Synthetic abort");
                error.name = "AbortError";
                reject(error);
              };
              if (init.signal.aborted) abort();
              else init.signal.addEventListener("abort", abort, { once: true });
            }
          });
        },
      };
      throw new Error("Unexpected dependency");
    },
  }, { timeout: 5000 });

  function render() {
    cursor = 0;
    effects = [];
    const result = exports.useRideDriverLocation(options);
    for (const effect of effects) effect();
    return result;
  }

  const h = {
    requests, options, timers,
    view() { render(); return render(); },
    reply(index, data, status = 200) {
      assert.ok(requests[index]);
      requests[index].resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
      });
    },
    appState(state) { appListener(state); h.view(); },
    account(value, notify = true) {
      session = value;
      if (notify) { sessionListener(); h.view(); }
    },
    timeout() {
      const timer = [...timers.entries()].find(([, value]) => !value.interval);
      assert.ok(timer);
      timers.delete(timer[0]);
      timer[1].callback();
    },
    dispose() {
      for (const slot of slots) slot?.dispose?.();
      cleanups.delete(h);
    },
  };
  cleanups.add(h);
  return h;
}

function position(overrides = {}) {
  return {
    rideId: "synthetic-ride",
    driverId: "synthetic-driver",
    latitude: 1, longitude: 2,
    accuracy: 3, heading: 90, speed: 5,
    recordedAt: "2026-01-01T00:00:02Z",
    isFresh: true,
    ...overrides,
  };
}

async function start(options) {
  const h = harness(options);
  h.view();
  await flush();
  assert.equal(h.requests.length, 1);
  return h;
}

async function test(name, work) {
  currentTest = name;
  await work();
  passed++;
  console.log("PASS:", name);
}

(async () => {
  try {
    await test("Polling uses two seconds and the existing authenticated endpoint", async () => {
      const h = await start();
      assert.ok([...h.timers.values()].some(t => t.interval && t.delay === 2000));
      assert.ok(h.requests[0].url.includes("synthetic-ride"));
      h.reply(0, position());
      await flush();
      assert.equal(h.view().location.driverId, "synthetic-driver");
      h.dispose();
    });

    await test("Pending requests do not overlap", async () => {
      const h = await start();
      await h.view().refresh();
      assert.equal(h.requests.length, 1);
      h.dispose();
      await flush();
    });

    await test("Older timestamps cannot roll back a driver position", async () => {
      const h = await start();
      h.reply(0, position({ latitude: 2 }));
      await flush();
      const pending = h.view().refresh();
      await flush();
      h.reply(1, position({
        latitude: 1, recordedAt: "2026-01-01T00:00:01Z",
      }));
      await pending;
      assert.equal(h.view().location.latitude, 2);
      h.dispose();
    });

    await test("Wrong-ride responses are rejected", async () => {
      const h = await start();
      h.reply(0, position({ rideId: "different-synthetic-ride" }));
      await flush();
      assert.equal(h.view().location, null);
      assert.ok(h.view().error);
      h.dispose();
    });

    await test("Invalid coordinates and timestamps are rejected", async () => {
      for (const invalid of [
        { latitude: 91 }, { longitude: 181 },
        { recordedAt: "not-a-date" }, { latitude: null },
      ]) {
        const h = await start();
        h.reply(0, position(invalid));
        await flush();
        assert.equal(h.view().location, null);
        assert.ok(h.view().error);
        h.dispose();
      }
    });

    await test("Stale-location freshness flag remains false", async () => {
      const h = await start();
      h.reply(0, position({ isFresh: false }));
      await flush();
      assert.equal(h.view().location.isFresh, false);
      h.dispose();
    });

    await test("404 clears the unavailable position without a fake fix", async () => {
      const h = await start();
      h.reply(0, position());
      await flush();
      const pending = h.view().refresh();
      await flush();
      h.reply(1, null, 404);
      await pending;
      assert.equal(h.view().location, null);
      assert.equal(h.view().error, null);
      h.dispose();
    });

    await test("Upload/read failure retains the last confirmed position", async () => {
      const h = await start();
      h.reply(0, position());
      await flush();
      const pending = h.view().refresh();
      await flush();
      h.reply(1, null, 500);
      await pending;
      assert.equal(h.view().location.driverId, "synthetic-driver");
      assert.ok(h.view().error);
      h.dispose();
    });

    await test("Account change rejects an old account's late response", async () => {
      const h = await start({ honorAbort: false });
      h.account({
        rider: { id: "another-synthetic-rider" },
        accessToken: "another-synthetic-token",
      });
      await flush();
      h.reply(0, position());
      await flush();
      assert.equal(h.view().location, null);
      h.reply(1, position());
      await flush();
      h.dispose();
    });

    await test("Session comparison rejects a token change without notification", async () => {
      const h = await start();
      h.account({
        rider: { id: "synthetic-rider" },
        accessToken: "changed-synthetic-token",
      }, false);
      h.reply(0, position());
      await flush();
      assert.equal(h.view().location, null);
      h.dispose();
    });

    await test("Ride change rejects the previous ride's late response", async () => {
      const h = await start({ honorAbort: false });
      h.options.rideId = "next-synthetic-ride";
      h.view();
      await flush();
      h.reply(0, position());
      await flush();
      assert.equal(h.view().location, null);
      h.reply(1, position({ rideId: "next-synthetic-ride" }));
      await flush();
      assert.equal(h.view().location.rideId, "next-synthetic-ride");
      h.dispose();
    });

    await test("Backgrounding aborts polling and foreground resumes it", async () => {
      const h = await start();
      h.appState("background");
      await flush();
      assert.equal(h.requests[0].signal.aborted, true);
      assert.equal([...h.timers.values()].some(t => t.interval), false);
      h.appState("active");
      await flush();
      assert.equal(h.requests.length, 2);
      h.reply(1, position());
      await flush();
      h.dispose();
    });

    await test("Timeout releases a request and allows retry", async () => {
      const h = await start();
      h.timeout();
      await flush();
      assert.equal(h.view().isLoading, false);
      assert.ok(h.view().error);
      const pending = h.view().refresh();
      await flush();
      assert.equal(h.requests.length, 2);
      h.reply(1, position());
      await pending;
      h.dispose();
    });

    await test("Disabling tracking aborts requests and clears the position", async () => {
      const h = await start();
      h.options.enabled = false;
      h.view();
      await flush();
      assert.equal(h.requests[0].signal.aborted, true);
      assert.equal(h.view().location, null);
      h.dispose();
    });

    await test("Unmount removes listeners, timers, and pending requests", async () => {
      const h = await start();
      h.dispose();
      await flush();
      assert.equal(h.requests[0].signal.aborted, true);
      assert.equal(h.timers.size, 0);
    });

    console.log("Passed Rider tracking tests:", passed);
    console.log("No production requests or real positions used.");
  } catch {
    console.log("FAIL:", currentTest);
    console.log("Raw test details withheld.");
    process.exitCode = 1;
  } finally {
    for (const h of [...cleanups]) h.dispose();
  }
})();
