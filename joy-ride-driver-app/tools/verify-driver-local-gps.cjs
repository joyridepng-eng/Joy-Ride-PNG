const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

let currentTest = "Test preparation";
let passed = 0;
const cleanup = new Set();
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};

function hooks() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const api = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function"
          ? value(slots[index].value) : value;
      }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      const changed = !previous || dependencies.some(
        (value, n) => !Object.is(value, previous.dependencies[n])
      );
      if (changed) {
        slots[index] = { dependencies, dispose: previous?.dispose };
        effects.push(() => {
          slots[index].dispose?.();
          slots[index].dispose = effect();
        });
      }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      cursor++;
      return getSnapshot();
    },
  };
  const harness = {
    api,
    render(fn, options) {
      cursor = 0;
      effects = [];
      const result = fn(options);
      for (const effect of effects) effect();
      return result;
    },
    dispose() {
      for (const slot of slots) slot?.dispose?.();
      cleanup.delete(harness);
    },
  };
  cleanup.add(harness);
  return harness;
}

function load(file, mocks) {
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, module: { exports },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.includes("driver-auth")) return mocks.driverAuth;
      if (name.includes("tracking-foreground")) return mocks.foreground;
      if (name.includes("background-gps")) return mocks.background;
      throw new Error("Unexpected dependency");
    },
    AbortController, setTimeout, clearTimeout,
  }, { timeout: 5000 });
  return exports;
}

function sample(timestamp, latitude = 1) {
  return {
    timestamp,
    coords: {
      latitude, longitude: 2,
      accuracy: 3, heading: 90, speed: 5,
    },
  };
}

async function foreground(uploadEnabled) {
  const react = hooks();
  let callback;
  let removed = false;
  let calls = 0;
  const replies = [];
  const location = {
    requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: () => new Promise(() => {}),
    watchPositionAsync: async (options, listener) => {
      assert.equal(options.timeInterval, 1000);
      assert.equal(options.distanceInterval, 1);
      callback = listener;
      return { remove() { removed = true; } };
    },
    Accuracy: { High: 4 },
  };
  const module = load("hooks/use-driver-location-tracking-foreground.ts", {
    react: react.api,
    "react-native": { Platform: { OS: "android" } },
    "expo-location": location,
    driverAuth: {
      driverFetch: () => {
        calls++;
        return new Promise(resolve => replies.push(resolve));
      },
    },
  });
  const options = { enabled: true, rideId: "synthetic-ride", uploadEnabled };
  const render = () => react.render(module.useDriverLocationTracking, options);
  render();
  await flush();
  assert.equal(typeof callback, "function");
  return {
    react, render,
    emit: value => callback(value),
    reply: value => {
      const resolve = replies.shift();
      assert.equal(typeof resolve, "function");
      resolve(value);
    },
    calls: () => calls,
    removed: () => removed,
  };
}

function wrapper(usesBackgroundGPS = true) {
  const react = hooks();
  let appListener;
  let foregroundOptions;
  let local = null;
  let background = {
    status: "tracking", errorMessage: "",
    latestLocation: null, enabled: true,
  };
  const module = load("hooks/use-driver-location-tracking.ts", {
    react: react.api,
    "react-native": {
      AppState: {
        currentState: "active",
        addEventListener(_name, listener) {
          appListener = listener;
          return { remove() { appListener = undefined; } };
        },
      },
    },
    foreground: {
      useDriverLocationTracking(options) {
        foregroundOptions = options;
        return { latestLocation: local, status: "tracking", errorMessage: "" };
      },
    },
    background: {
      usesBackgroundGPS,
      subscribeBackgroundGPS: () => () => {},
      getBackgroundGPSSnapshot: () => background,
    },
  });
  return {
    react,
    render: options => react.render(module.useDriverLocationTracking, options),
    options: () => foregroundOptions,
    setLocal: value => { local = value; },
    setBackground: value => { background = value; },
    appState: value => appListener(value),
  };
}

async function test(name, work) {
  currentTest = name;
  await work();
  passed++;
  console.log("PASS:", name);
}

(async () => {
  try {
    await test("Local GPS updates without any upload", async () => {
      const h = await foreground(false);
      h.emit(sample(10000));
      assert.equal(h.render().latestLocation.latitude, 1);
      assert.equal(h.calls(), 0);
      h.react.dispose();
    });

    await test("Older GPS samples cannot move the marker backward", async () => {
      const h = await foreground(false);
      h.emit(sample(20000, 2));
      h.emit(sample(10000, 1));
      assert.equal(h.render().latestLocation.latitude, 2);
      h.react.dispose();
    });

    await test("Invalid GPS samples are not displayed", async () => {
      const h = await foreground(false);
      h.emit(sample(10000));
      h.emit(sample(20000, NaN));
      assert.equal(h.render().latestLocation.latitude, 1);
      h.react.dispose();
    });

    await test("Local position advances during a pending upload", async () => {
      const h = await foreground(true);
      h.emit(sample(10000, 1));
      assert.equal(h.calls(), 1);
      assert.equal(h.render().latestLocation.latitude, 1);
      h.emit(sample(20000, 2));
      assert.equal(h.render().latestLocation.latitude, 2);
      assert.equal(h.calls(), 1);
      h.reply({ ok: true, status: 200 });
      await flush();
      assert.equal(h.render().latestLocation.latitude, 2);
      assert.equal(h.calls(), 2);
      h.reply({ ok: true, status: 200 });
      await flush();
      h.react.dispose();
    });

    await test("Upload failure does not discard local position", async () => {
      const h = await foreground(true);
      h.emit(sample(10000));
      h.reply({ ok: false, status: 500 });
      await flush();
      assert.equal(h.render().latestLocation.latitude, 1);
      assert.ok(h.render().errorMessage);
      h.react.dispose();
    });

    await test("Unmount removes the GPS watcher and rejects late fixes", async () => {
      const h = await foreground(false);
      h.emit(sample(10000));
      h.react.dispose();
      assert.equal(h.removed(), true);
      h.emit(sample(20000, 2));
      assert.equal(h.render().latestLocation.latitude, 1);
      h.react.dispose();
    });

    await test("Production local watcher does not duplicate uploads", () => {
      const h = wrapper();
      h.render({ enabled: true });
      assert.equal(h.options().enabled, true);
      assert.equal(h.options().uploadEnabled, false);
      h.react.dispose();
    });

    await test("Backgrounding pauses local watcher; foreground resumes it", () => {
      const h = wrapper();
      h.render({ enabled: true });
      h.appState("background");
      h.render({ enabled: true });
      assert.equal(h.options().enabled, false);
      h.appState("active");
      h.render({ enabled: true });
      assert.equal(h.options().enabled, true);
      h.react.dispose();
    });

    await test("Stopped background tracking disables and hides local GPS", () => {
      const h = wrapper();
      h.setLocal({ recordedAt: "2026-01-01T00:00:02Z" });
      h.setBackground({
        enabled: false, status: "idle",
        errorMessage: "", latestLocation: null,
      });
      assert.equal(h.render({ enabled: true }).latestLocation, null);
      assert.equal(h.options().enabled, false);
      h.react.dispose();
    });

    await test("Newest position wins over a delayed server snapshot", () => {
      const h = wrapper();
      const local = { recordedAt: "2026-01-01T00:00:02Z" };
      const uploaded = { recordedAt: "2026-01-01T00:00:01Z" };
      h.setLocal(local);
      h.setBackground({
        enabled: true, status: "error",
        errorMessage: "synthetic-upload-error", latestLocation: uploaded,
      });
      const result = h.render({ enabled: true });
      assert.equal(result.latestLocation, local);
      assert.equal(result.errorMessage, "synthetic-upload-error");
      h.react.dispose();
    });

    await test("Newer background position supersedes older local position", () => {
      const h = wrapper();
      const uploaded = { recordedAt: "2026-01-01T00:00:03Z" };
      h.setLocal({ recordedAt: "2026-01-01T00:00:02Z" });
      h.setBackground({
        enabled: true, status: "tracking",
        errorMessage: "", latestLocation: uploaded,
      });
      assert.equal(h.render({ enabled: true }).latestLocation, uploaded);
      h.react.dispose();
    });

    await test("Disabled ride screen hides location", () => {
      const h = wrapper();
      h.setLocal({ recordedAt: "2026-01-01T00:00:02Z" });
      assert.equal(h.render({ enabled: false }).latestLocation, null);
      assert.equal(h.options().enabled, false);
      h.react.dispose();
    });

    await test("Foreground-only platform retains its uploader", () => {
      const h = wrapper(false);
      h.render({ enabled: true });
      assert.equal(h.options().uploadEnabled, true);
      h.react.dispose();
    });

    console.log("Passed GPS tests:", passed);
    console.log("No production requests or real locations used.");
  } catch {
    console.log("FAIL:", currentTest);
    console.log("Raw test details withheld.");
    process.exitCode = 1;
  } finally {
    for (const harness of [...cleanup]) harness.dispose();
  }
})();
