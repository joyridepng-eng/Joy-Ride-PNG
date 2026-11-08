"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
function load(file, imports) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: (name) => {
      if (!(name in imports)) throw Error("Unexpected dependency");
      return imports[name];
    },
    AbortController,
    setTimeout,
    clearTimeout,
    console: { log() {}, error() {} },
    fetch: (...args) => net(...args),
  };
  vm.runInNewContext(code, context, { filename: file });
  return module.exports;
}
let net = async () => {
  throw Error("Unexpected network");
};
const core = load("services/driver-safety-core.ts", {});
const now = "2026-09-29T08:00:00.000Z";
const uid = "12345678-1234-4123-8123-123456789abc";
const base = {
  id: "alert-1",
  clientRequestId: uid,
  status: "OPEN",
  message: "Help",
  createdAt: now,
  acknowledgedAt: null,
  resolvedAt: null,
  latitude: null,
  longitude: null,
  locationRecordedAt: null,
  locationIsStale: true,
  locationAccepted: false,
  serverReceived: true,
  humanAcknowledged: false,
  adminInboxItemCount: 1,
};
const db = new Map();
let posts = [];
const store = {
  read: async (k) => db.get(k) ?? null,
  write: async (k, v) => {
    db.set(k, v);
  },
};
let response = base;
const request = async (owner, route, init) => {
  if (init?.method === "POST")
    posts.push({ owner, route, body: JSON.parse(init.body) });
  return response;
};
let passed = 0,
  stage = "";
async function test(name, work) {
  stage = name;
  await work();
  passed++;
  console.log(`PASS: ${name}`);
}
(async () => {
  await test("Persist before POST; retries preserve incident payload", async () => {
    const c = core.createSafetyClient(store, request, () => uid);
    await c.prepare("driver-a", "Help");
    assert.equal(posts.length, 0);
    await c.send("driver-a");
    await c.send("driver-a");
    assert.equal(posts.length, 2);
    assert.equal(JSON.stringify(posts[0].body), JSON.stringify(posts[1].body));
    assert.equal(posts[0].body.driverId, undefined);
    assert.equal(posts[0].body.alertId, undefined);
    assert.equal((await c.load("driver-a")).alertId, "alert-1");
  });
  await test("Lost response and restart reuse saved UUID", async () => {
    let attempts = 0;
    const bodies = [];
    const c = core.createSafetyClient(
      store,
      async (_id, _path, init) => {
        bodies.push(init.body);
        if (++attempts === 1) throw Error("Lost reply");
        return base;
      },
      () => uid,
    );
    await c.prepare("driver-b", "Help");
    await assert.rejects(c.send("driver-b"));
    const restarted = core.createSafetyClient(
      store,
      async (_id, _path, init) => {
        bodies.push(init.body);
        return base;
      },
    );
    await restarted.send("driver-b");
    assert.equal(bodies[0], bodies[1]);
  });
  await test("Storage failure prevents creation and network submission", async () => {
    let calls = 0;
    const c = core.createSafetyClient(
      {
        read: async () => null,
        write: async () => {
          throw Error("Disk full");
        },
      },
      async () => {
        calls++;
        return base;
      },
    );
    await assert.rejects(c.prepare("driver-c", "Help"));
    await assert.rejects(c.send("driver-c"));
    assert.equal(calls, 0);
  });
  await test("Unconfirmed incident cannot be overwritten", async () => {
    const c = core.createSafetyClient(store, request, () => uid);
    await c.prepare("driver-d", "Help");
    await assert.rejects(c.prepare("driver-d", "Different", undefined, true));
    assert.equal((await c.load("driver-d")).message, "Help");
  });
  await test("Driver records isolated and corrupted data retained", async () => {
    const c = core.createSafetyClient(store, request);
    assert.equal(await c.load("driver-new"), null);
    db.set(
      "joyride-emergency-v1-driver-x",
      db.get("joyride-emergency-v1-driver-a"),
    );
    await assert.rejects(c.load("driver-x"));
    assert.ok(db.has("joyride-emergency-v1-driver-x"));
    db.set("joyride-emergency-v1-driver-y", "broken");
    await assert.rejects(c.load("driver-y"));
    assert.equal(db.get("joyride-emergency-v1-driver-y"), "broken");
  });
  await test("Concurrent taps allow only one send", async () => {
    let release;
    let calls = 0;
    const c = core.createSafetyClient(store, async () => {
      calls++;
      return new Promise((r) => {
        release = r;
      });
    });
    const first = c.send("driver-a");
    await new Promise((r) => setTimeout(r, 0));
    await assert.rejects(c.send("driver-a"));
    assert.equal(calls, 1);
    release(base);
    await first;
  });
  await test("Mismatched server identity never confirms saved incident", async () => {
    const c = core.createSafetyClient(
      store,
      async () => ({
        ...base,
        clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      () => uid,
    );
    await c.prepare("driver-e", "Help");
    await assert.rejects(c.send("driver-e"));
    assert.equal((await c.load("driver-e")).alertId, null);
  });
  await test("Receipt, acknowledgement and resolution remain distinct", async () => {
    assert.equal(core.parseEmergency(base).status, "OPEN");
    assert.throws(() =>
      core.parseEmergency({ ...base, humanAcknowledged: true }),
    );
    assert.throws(() =>
      core.parseEmergency({ ...base, status: "RESOLVED", resolvedAt: now }),
    );
    assert.equal(
      core.parseEmergency({
        ...base,
        status: "ACKNOWLEDGED",
        acknowledgedAt: now,
        humanAcknowledged: true,
      }).status,
      "ACKNOWLEDGED",
    );
    assert.equal(
      core.parseEmergency({
        ...base,
        status: "RESOLVED",
        acknowledgedAt: now,
        resolvedAt: now,
        humanAcknowledged: true,
      }).status,
      "RESOLVED",
    );
  });
  await test("No-GPS accepted; malformed location rejected", async () => {
    assert.equal(core.parseEmergency(base).latitude, null);
    assert.throws(() =>
      core.parseEmergency({ ...base, latitude: 91, longitude: 0 }),
    );
    assert.throws(() => core.parseEmergency({ ...base, latitude: 0 }));
    assert.throws(() =>
      core.parsePosition({ latitude: 0, longitude: 0, recordedAt: "invalid" }),
    );
  });
  await test("Summary supports unrated categories and excludes private data", async () => {
    const none = { average: null, count: 0 };
    const v = core.parseSummary({
      ratingCount: 0,
      overall: none,
      customerCare: none,
      professionalism: none,
      driving: none,
      cleanliness: none,
      comments: ["private"],
    });
    assert.equal(v.overall.average, null);
    assert.equal(v.comments, undefined);
    assert.throws(() =>
      core.parseSummary({ ...v, overall: { average: 0, count: 0 } }),
    );
    assert.throws(() =>
      core.parseSummary({ ...v, overall: { average: 6, count: 1 } }),
    );
  });
  let session = { driver: { id: "driver-a" }, accessToken: "fixture-token" };
  let permission = true,
    loc = null;
  const binding = load("services/driver-safety.ts", {
    "@/constants/api": { API_BASE_URL: "https://fixture.invalid" },
    "@/services/driver-session": { loadDriverSession: async () => session },
    "expo-secure-store": {
      getItemAsync: store.read,
      setItemAsync: store.write,
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "fixture",
    },
    "expo-location": {
      requestForegroundPermissionsAsync: async () => ({ granted: permission }),
      getLastKnownPositionAsync: async () => loc,
    },
    "react-native": { Platform: { OS: "android" } },
    "./driver-safety-core": core,
  });
  await test("Transport refuses account switching before network", async () => {
    let calls = 0;
    net = async () => {
      calls++;
      return { ok: true, json: async () => base };
    };
    await assert.rejects(
      binding.createSafetyRequest()("driver-b", "/emergencies/driver/me"),
    );
    assert.equal(calls, 0);
    session = null;
    await assert.rejects(
      binding.createSafetyRequest()("driver-a", "/emergencies/driver/me"),
    );
    assert.equal(calls, 0);
    session = { driver: { id: "driver-a" }, accessToken: "fixture-token" };
  });
  await test("Timeout settles even when network ignores abort", async () => {
    net = async () => new Promise(() => {});
    await assert.rejects(
      binding.createSafetyRequest(15)("driver-a", "/emergencies/driver/me"),
      /No confirmation/,
    );
  });
  await test("Pre-cancelled request cannot send", async () => {
    let calls = 0;
    net = async () => {
      calls++;
      return { ok: true, json: async () => base };
    };
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      binding.createSafetyRequest()("driver-a", "/emergencies/driver/me", {
        signal: ac.signal,
      }),
    );
    assert.equal(calls, 0);
  });
  await test("HTTP errors never expose raw response body", async () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500]) {
      net = async () => ({
        ok: false,
        status,
        json: async () => ({ message: "PRIVATE_TEST_MARKER" }),
      });
      await assert.rejects(
        binding.createSafetyRequest()("driver-a", "/emergencies/driver/me"),
        (e) => !e.message.includes("PRIVATE_TEST_MARKER"),
      );
    }
  });
  await test("Optional location denial and absence do not block alert draft", async () => {
    permission = false;
    assert.equal(await binding.optionalPosition(), undefined);
    permission = true;
    assert.equal(await binding.optionalPosition(), undefined);
    loc = {
      timestamp: Date.now(),
      coords: { latitude: -9, longitude: 147, accuracy: 20 },
    };
    assert.equal((await binding.optionalPosition()).longitude, 147);
  });
  const mapCore = load("services/emergency-map-core.ts", {
    "./driver-safety-core": core,
  });
  await test("Explicit pin selection validates coordinates without inventing a map-centre location", async () => {
    for (const value of [
      undefined,
      null,
      {},
      { latitude: 91, longitude: 147 },
      { latitude: -9, longitude: Infinity },
    ])
      assert.equal(mapCore.selectedIncidentPoint(value), undefined);
    const point = mapCore.selectedIncidentPoint(
      { latitude: 0, longitude: 0, accuracyMeters: 20 },
      Date.parse(now),
    );
    assert.equal(point.source, "MANUAL_PIN");
    assert.equal(point.latitude, 0);
    assert.equal(point.recordedAt, now);
    assert.equal(point.accuracyMeters, undefined);
  });
  await test("Manual pin never borrows GPS accuracy; legacy saved sources remain unknown", async () => {
    const manual = core.parsePosition({
      source: "MANUAL_PIN",
      latitude: -9,
      longitude: 147,
      recordedAt: now,
      accuracyMeters: 20,
    });
    assert.equal(manual.accuracyMeters, undefined);
    const legacy = core.parsePosition({
      latitude: -9,
      longitude: 147,
      recordedAt: now,
    });
    assert.equal(legacy.source, undefined);
    assert.throws(() =>
      core.parsePosition({ ...legacy, source: "unexpected" }),
    );
    assert.equal(core.parseEmergency(base).locationSource, null);
  });
  await test("Lost reply and restart preserve selected incident point, source, time and retry ID", async () => {
    const bodies = [];
    const point = mapCore.selectedIncidentPoint(
      { latitude: -9.44, longitude: 147.18 },
      Date.parse(now),
    );
    const reply = {
      ...base,
      latitude: point.latitude,
      longitude: point.longitude,
      locationRecordedAt: now,
      locationSource: "MANUAL_PIN",
      locationAccepted: true,
    };
    const c = core.createSafetyClient(
      store,
      async (_id, _path, init) => {
        bodies.push(init.body);
        throw Error("Lost reply");
      },
      () => uid,
    );
    await c.prepare("driver-pin", "Help", point);
    await assert.rejects(c.send("driver-pin"));
    await assert.rejects(
      c.prepare("driver-pin", "Help", { ...point, latitude: -8 }, true),
    );
    const restarted = core.createSafetyClient(
      store,
      async (_id, _path, init) => {
        bodies.push(init.body);
        return reply;
      },
    );
    assert.equal(
      (await restarted.send("driver-pin")).locationSource,
      "MANUAL_PIN",
    );
    assert.equal(bodies[0], bodies[1]);
    assert.equal(JSON.parse(bodies[1]).location.latitude, -9.44);
    assert.equal(
      (await restarted.load("driver-pin")).location.source,
      "MANUAL_PIN",
    );
    assert.equal(
      (await restarted.load("driver-pin")).location.accuracyMeters,
      undefined,
    );
  });
  await test("Legacy saved incident retry does not retag or move its location", async () => {
    let body;
    const point = { latitude: -9, longitude: 147, recordedAt: now };
    const c = core.createSafetyClient(
      store,
      async (_id, _path, init) => {
        body = JSON.parse(init.body);
        return {
          ...base,
          latitude: -9,
          longitude: 147,
          locationRecordedAt: now,
          locationAccepted: true,
        };
      },
      () => uid,
    );
    await c.prepare("driver-legacy", "Help", point);
    await c.send("driver-legacy");
    assert.equal(body.location.source, undefined);
    assert.equal(body.location.recordedAt, now);
  });
  await test("Location labels distinguish fixed manual selection, stale GPS and unknown legacy origin", async () => {
    const point = { latitude: -9, longitude: 147, recordedAt: now };
    assert.match(
      mapCore.incidentLocationText({ ...point, source: "MANUAL_PIN" }),
      /not live GPS/,
    );
    assert.match(
      mapCore.incidentLocationText(
        { ...point, source: "GPS" },
        Date.parse(now) + 120001,
      ),
      /stale/,
    );
    assert.match(mapCore.incidentLocationText(point), /source unknown/);
    assert.match(
      mapCore.incidentLocationText(undefined),
      /No incident location/,
    );
  });
  await test("Native GET keeps strict query unchanged and POST retains JSON content type", async () => {
    const NativeRequest = require("whatwg-fetch").Request;
    const url = "https://fixture.invalid/emergencies/driver/me?limit=25";
    assert.notEqual(new NativeRequest(url, { cache: "no-store" }).url, url);
    net = async (input, init) => {
      assert.equal(init.cache, undefined);
      assert.equal(new Headers(init.headers).get("Cache-Control"), "no-store");
      assert.equal(new NativeRequest(input, init).url, input);
      if (init.method === "POST") {
        assert.equal(
          new Headers(init.headers).get("Content-Type"),
          "application/json",
        );
        assert.equal(JSON.parse(init.body).location.source, "MANUAL_PIN");
      }
      return { ok: true, json: async () => base };
    };
    await binding.createSafetyRequest()(
      "driver-a",
      "/emergencies/driver/me?limit=25",
    );
    await binding.createSafetyRequest()("driver-a", "/emergencies/driver/me", {
      method: "POST",
      body: JSON.stringify({ location: { source: "MANUAL_PIN" } }),
    });
  });
  await test("GPS snapshot is tagged and independently refuses stale cached fixes", async () => {
    permission = true;
    loc = {
      timestamp: Date.now(),
      coords: { latitude: -9, longitude: 147, accuracy: 20 },
    };
    assert.equal((await binding.optionalPosition()).source, "GPS");
    loc.timestamp = Date.now() - 120001;
    assert.equal(await binding.optionalPosition(), undefined);
    loc.timestamp = Date.now() + 60001;
    assert.equal(await binding.optionalPosition(), undefined);
  });
  const places = load("services/incident-place-search.ts", {});
  await test("place search validates queries and adds PNG context", async () => {
    assert.equal(
      places.incidentSearchQuery("  Boroko   Port Moresby  "),
      "Boroko Port Moresby, Papua New Guinea",
    );
    assert.equal(
      places.incidentSearchQuery("Mount Hagen PNG"),
      "Mount Hagen PNG",
    );
    for (const input of ["", "ab", "x".repeat(161), "Boroko\nPort Moresby"])
      assert.equal(places.incidentSearchQuery(input), undefined);
  });
  await test("suggested points reject invalid coordinates and preserve zero without GPS accuracy", async () => {
    const result = places.incidentSearchPoints([
      { latitude: 0, longitude: 0, accuracy: 5 },
      { latitude: 0, longitude: 0 },
      { latitude: NaN, longitude: 1 },
      { latitude: 91, longitude: 1 },
      { latitude: 1, longitude: "147" },
      { latitude: -9, longitude: 147 },
    ]);
    assert.equal(
      JSON.stringify(result),
      JSON.stringify([
        { latitude: 0, longitude: 0 },
        { latitude: -9, longitude: 147 },
      ]),
    );
    assert.equal(
      places.incidentSearchPoints(
        Array.from({ length: 20 }, (_, i) => ({ latitude: i, longitude: i })),
      ).length,
      5,
    );
  });
  await test("search gives candidates only and cannot attach GPS provenance", async () => {
    const search = places.createIncidentPlaceSearch(async () => [
      { latitude: -9, longitude: 147, accuracy: 5 },
    ]);
    const outcome = await search.search("Boroko");
    assert.equal(outcome.kind, "results");
    assert.equal(
      JSON.stringify(outcome.points),
      JSON.stringify([{ latitude: -9, longitude: 147 }]),
    );
  });
  await test("cancelled lookup ignores late results and blocks overlapping native calls", async () => {
    let release;
    let calls = 0;
    const search = places.createIncidentPlaceSearch(() => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = search.search("Boroko");
    await Promise.resolve();
    search.cancel();
    assert.equal((await first).kind, "cancelled");
    assert.equal((await search.search("Gerehu")).kind, "busy");
    assert.equal(calls, 1);
    release([{ latitude: -9, longitude: 147 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await search.search("ab")).kind, "invalid");
  });
  await test("timed out native search blocks overlap and recovers without stale results", async () => {
    let release;
    let calls = 0;
    const search = places.createIncidentPlaceSearch(() => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve([{ latitude: -8, longitude: 146 }]);
    }, 5);
    assert.equal((await search.search("Boroko")).kind, "timeout");
    assert.equal((await search.search("Gerehu")).kind, "busy");
    assert.equal(calls, 1);
    release([{ latitude: -9, longitude: 147 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const next = await search.search("Gerehu");
    assert.equal(next.kind, "results");
    assert.equal(next.points[0].latitude, -8);
    assert.equal(calls, 2);
  });
  await test("denied permission, unavailable search and no matches are safe outcomes", async () => {
    assert.equal(
      (
        await places
          .createIncidentPlaceSearch(async () => {
            throw new places.IncidentSearchPermissionDenied();
          })
          .search("Boroko")
      ).kind,
      "denied",
    );
    assert.equal(
      (
        await places
          .createIncidentPlaceSearch(async () => {
            throw Error("private provider detail");
          })
          .search("Boroko")
      ).kind,
      "failed",
    );
    assert.equal(
      (await places.createIncidentPlaceSearch(async () => []).search("Boroko"))
        .kind,
      "empty",
    );
  });
  console.log(
    `PASS: ${passed} offline Driver safety checks. No network or database connection.`,
  );
})().catch(() => {
  console.error(`FAIL: ${stage}. Raw details withheld.`);
  process.exitCode = 1;
});
