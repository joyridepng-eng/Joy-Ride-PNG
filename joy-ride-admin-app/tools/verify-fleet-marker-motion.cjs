const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
let currentTest = "Preparation";
let passed = 0;

function frames() {
  let id = 0;
  const pending = new Map();
  return {
    pending,
    request(callback) { pending.set(++id, callback); return id; },
    cancel(key) { pending.delete(key); },
    tick(time) {
      const work = [...pending.values()];
      pending.clear();
      for (const callback of work) callback(time);
    },
  };
}
function load(file, mocks, clock) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports, module: { exports },
    requestAnimationFrame: callback => clock.request(callback),
    cancelAnimationFrame: id => clock.cancel(id),
    document: {
      createElement: () => ({ textContent: "", setAttribute() {} }),
    },
    window: { setTimeout: () => 0 },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith(".css")) return {};
      if (name.includes("fleet-marker-motion")) return mocks.motion;
      throw new Error("Unexpected dependency");
    },
  }, { timeout: 5000 });
  return exports;
}
function movingMarker(point) {
  return {
    point: [...point],
    getLatLng() { return { lat: this.point[0], lng: this.point[1] }; },
    setLatLng(value) { this.point = Array.from(value); return this; },
  };
}
function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.00000001);
}
const time = "2026-01-01T00:00:02Z";

async function test(name, work) {
  currentTest = name;
  await work();
  passed++;
  console.log("PASS:", name);
}

function motionHarness() {
  const clock = frames();
  const module = load("services/fleet-marker-motion.ts", {}, clock);
  return { clock, motion: module.createFleetMarkerMotion(clock) };
}

function webHarness() {
  const clock = frames();
  const helper = load("services/fleet-marker-motion.ts", {}, clock);
  const slots = [];
  const refs = [];
  let cursor = 0;
  let effects = [];

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
    forwardRef: fn => fn,
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
      if (!slots[index]) {
        slots[index] = { ref: { current: initial } };
        refs.push(slots[index].ref);
      }
      return slots[index].ref;
    },
    useMemo: memo,
    useCallback: (callback, dependencies) => memo(() => callback, dependencies),
    useImperativeHandle(ref, factory, dependencies) {
      const value = memo(factory, dependencies);
      if (ref) ref.current = value;
    },
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

  const markers = [];
  const map = {
    removed: false,
    setView() { return this; },
    fitBounds() { return this; },
    invalidateSize() {},
    remove() { this.removed = true; },
  };
  const leaflet = {
    map: () => map,
    latLngBounds: values => values,
    divIcon: options => ({ options }),
    tileLayer: () => ({ addTo() { return this; } }),
    marker(point, options) {
      const marker = {
        ...movingMarker(point),
        options,
        removed: false,
        iconUpdates: 0,
        events: {},
        addTo() { return this; },
        removeFrom() { this.removed = true; return this; },
        bindTooltip(content) { this.tooltip = content; return this; },
        getTooltip() { return this.tooltip; },
        setTooltipContent(content) { this.tooltip = content; return this; },
        on(name, callback) { this.events[name] = callback; return this; },
        setIcon(icon) { this.options.icon = icon; this.iconUpdates++; return this; },
        getElement() { return { setAttribute() {} }; },
      };
      markers.push(marker);
      return marker;
    },
    polyline: () => ({ addTo() { return this; }, remove() {} }),
  };

  const module = load("components/fleet-map/fleet-map.web.tsx", {
    react,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    leaflet,
    motion: helper,
  }, clock);

  const handle = {};
  const props = {
    locations: [],
    selectedDriverId: null,
    selectedRide: null,
    route: null,
    onSelectDriver() {},
  };
  return {
    clock, markers, map, props,
    render() {
      cursor = 0;
      effects = [];
      module.default(props, handle);
      if (refs[0]) refs[0].current = {};
      for (const effect of effects) effect();
    },
    dispose() {
      for (const slot of slots) slot?.dispose?.();
    },
  };
}

function fleetLocation(id, latitude, timestamp) {
  return {
    id: "location-" + id, driverId: id,
    latitude, longitude: 2,
    accuracy: 3, heading: 90, speed: 5,
    recordedAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(timestamp).toISOString(),
    driver: {
      id, fullName: "Synthetic driver", isOnline: true, isAvailable: true,
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};

(async () => {
  try {
    await test("Marker interpolates smoothly over two seconds", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time);
      clock.tick(0);
      clock.tick(1000);
      near(marker.point[0], 1.001);
      clock.tick(2000);
      near(marker.point[0], 1.002);
      assert.equal(clock.pending.size, 0);
    });

    await test("Multiple vehicles animate independently", () => {
      const { clock, motion } = motionHarness();
      const a = movingMarker([1, 2]);
      const b = movingMarker([3, 4]);
      motion.move("a", a, [1.002, 2], time);
      motion.move("b", b, [3.004, 4], time);
      clock.tick(0);
      clock.tick(1000);
      near(a.point[0], 1.001);
      near(b.point[0], 3.002);
      motion.clear();
    });

    await test("Unchanged targets do not restart an animation", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time);
      clock.tick(0);
      clock.tick(1000);
      motion.move("a", marker, [1.002, 2], "2026-01-01T00:00:03Z");
      clock.tick(2000);
      near(marker.point[0], 1.002);
      assert.equal(clock.pending.size, 0);
    });

    await test("Older timestamps cannot move a vehicle backward", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time);
      motion.move("a", marker, [0.999, 2], "2026-01-01T00:00:01Z");
      clock.tick(0);
      clock.tick(2000);
      near(marker.point[0], 1.002);
    });

    await test("Retargeting continues from the currently displayed position", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time);
      clock.tick(0);
      clock.tick(1000);
      near(marker.point[0], 1.001);
      motion.move("a", marker, [1.003, 2], "2026-01-01T00:00:03Z");
      clock.tick(1000);
      near(marker.point[0], 1.001);
      clock.tick(2000);
      near(marker.point[0], 1.002);
      motion.clear();
    });

    await test("Stale positions are not shown as continuing movement", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time, false);
      near(marker.point[0], 1.002);
      assert.equal(clock.pending.size, 0);
    });

    await test("Invalid coordinates and timestamps are ignored", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [91, 2], time);
      motion.move("a", marker, [1.002, 2], "invalid-date");
      near(marker.point[0], 1);
      assert.equal(clock.pending.size, 0);
    });

    await test("Large discontinuities snap instead of flying across the map", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [2, 3], time);
      near(marker.point[0], 2);
      assert.equal(clock.pending.size, 0);
    });

    await test("Removing one vehicle leaves other animations running", () => {
      const { clock, motion } = motionHarness();
      const a = movingMarker([1, 2]);
      const b = movingMarker([3, 4]);
      motion.move("a", a, [1.002, 2], time);
      motion.move("b", b, [3.002, 4], time);
      clock.tick(0);
      motion.remove("a");
      clock.tick(2000);
      near(a.point[0], 1);
      near(b.point[0], 3.002);
    });

    await test("No movement is extrapolated beyond the last reported fix", () => {
      const { clock, motion } = motionHarness();
      const marker = movingMarker([1, 2]);
      motion.move("a", marker, [1.002, 2], time);
      clock.tick(0);
      clock.tick(2000);
      clock.tick(10000);
      near(marker.point[0], 1.002);
      assert.equal(clock.pending.size, 0);
    });

    await test("Fleet refresh reuses existing markers and preserves selection", async () => {
      const h = webHarness();
      try {
        h.render();
        await flush();
        h.render();
        const now = Date.now();
        h.props.locations = [
          fleetLocation("a", 1, now),
          fleetLocation("b", 3, now),
        ];
        h.render();
        assert.equal(h.markers.length, 2);
        const first = h.markers[0];

        h.props.locations = [
          fleetLocation("a", 1.002, now + 1000),
          fleetLocation("b", 3.002, now + 1000),
        ];
        const selected = [];
        h.props.onSelectDriver = id => selected.push(id);
        h.props.selectedDriverId = "a";
        h.render();

        assert.equal(h.markers.length, 2);
        first.events.click();
        assert.equal(selected[0], "a");
        h.clock.tick(0);
        h.clock.tick(1000);
        near(first.point[0], 1.001);

        h.props.locations = [fleetLocation("b", 3.002, now + 2000)];
        h.render();
        assert.equal(first.removed, true);
        assert.equal(h.markers[1].removed, false);
      } finally {
        h.dispose();
      }
      assert.equal(h.clock.pending.size, 0);
      assert.equal(h.map.removed, true);
    });

    console.log("Passed Admin fleet tests:", passed);
    console.log("No production requests or real positions used.");
  } catch {
    console.log("FAIL:", currentTest);
    console.log("Raw test details withheld.");
    process.exitCode = 1;
  }
})();
