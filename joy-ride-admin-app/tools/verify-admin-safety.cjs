/* Offline contract tests. No network, environment files, credentials or database. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
function sourceModule(
  relative,
  fetcher = async () => {
    throw new Error("UNEXPECTED_FETCH");
  },
) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exported = {};
  vm.runInNewContext(
    js,
    {
      exports: exported,
      require: (name) => {
        if (name === "@/services/admin-auth") return { adminFetch: fetcher };
        if (name === "./emergency-map-core")
          return sourceModule("services/emergency-map-core.ts");
        throw new Error("UNEXPECTED_IMPORT");
      },
      URLSearchParams,
      Headers,
      AbortController,
      setTimeout,
      clearTimeout,
    },
    { filename: relative },
  );
  return exported;
}
const api = sourceModule("services/admin-safety.ts");
const json = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const plain = (value) => JSON.parse(JSON.stringify(value));
const time = "2026-09-29T00:00:00.000Z";
const emergency = {
  id: "alert-1",
  status: "OPEN",
  message: "Need help",
  createdAt: time,
  updatedAt: time,
  acknowledgedAt: null,
  resolvedAt: null,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  locationRecordedAt: null,
  locationAgeSeconds: null,
  locationIsStale: true,
  driver: {
    id: "driver-1",
    fullName: "Test driver",
    phone: "test-only",
    vehicles: [],
  },
  ride: null,
  events: [
    {
      id: "event-1",
      action: "CREATED",
      note: null,
      createdAt: time,
      admin: null,
    },
  ],
};
const feedback = {
  id: "feedback-1",
  rideId: "ride-1",
  driverId: "driver-1",
  overallRating: 4,
  customerCareRating: null,
  professionalismRating: 5,
  drivingRating: null,
  cleanlinessRating: null,
  comment: "Private rider comment",
  createdAt: time,
  updatedAt: time,
  reviewStatus: "NEW",
  driver: { id: "driver-1", fullName: "Test driver" },
  reviewEvents: [],
};
const notification = {
  id: "notice-1",
  audience: "ADMIN",
  eventType: "RIDE_REQUESTED",
  title: "Test",
  body: "Test",
  isRead: false,
  readAt: null,
  createdAt: time,
  updatedAt: time,
  ride: null,
};
let stage = "initialize",
  count = 0;
async function check(name, fn) {
  stage = name;
  await fn();
  count++;
  console.log(`PASS: ${name}`);
}
async function main() {
  await check(
    "Native feedback fetch preserves strict query without cache-buster properties",
    async () => {
      const NativeRequest = require("whatwg-fetch").Request;
      const url = "https://example.invalid/feedback/admin?limit=25&status=NEW";
      assert(new NativeRequest(url, { cache: "no-store" }).url.includes("&_="));
      const client = api.createAdminSafetyClient(async (route, init) => {
        assert.equal(route, "/feedback/admin?limit=25&status=NEW");
        assert.equal(init.cache, undefined);
        assert.equal(
          new Headers(init.headers).get("Cache-Control"),
          "no-store",
        );
        assert.equal(
          new NativeRequest("https://example.invalid" + route, init).url,
          url,
        );
        assert(init.signal instanceof AbortSignal);
        return json({ items: [feedback], nextCursor: null });
      });
      assert.equal((await client.feedback("NEW")).items.length, 1);
    },
  );
  await check(
    "Cache header preserves feedback review content type and payload",
    async () => {
      const client = api.createAdminSafetyClient(async (_route, init) => {
        const headers = new Headers(init.headers);
        assert.equal(headers.get("Cache-Control"), "no-store");
        if (init.method === "PATCH") {
          assert.equal(headers.get("Content-Type"), "application/json");
          assert.equal(JSON.parse(init.body).note, "Controlled test");
        }
        return json(feedback);
      });
      const item = await client.feedbackDetail("feedback-1");
      await client.review(item, "REVIEWED", "Controlled test");
    },
  );
  await check(
    "Legacy inbox responses remain readable before backend deployment",
    async () => {
      const inbox = sourceModule("services/admin-notifications.ts", async () =>
        json({ unreadCount: 1, items: [notification] }),
      );
      assert.equal((await inbox.loadAdminNotificationInbox()).items.length, 1);
    },
  );
  await check(
    "Emergency inbox items are accepted and marking read never acknowledges them",
    async () => {
      const calls = [];
      const item = {
        ...notification,
        eventType: "DRIVER_EMERGENCY_ALERT",
        emergencyAlertId: "alert-1",
        emergencyAlert: { id: "alert-1", status: "OPEN", createdAt: time },
      };
      const inbox = sourceModule(
        "services/admin-notifications.ts",
        async (url, init) => {
          calls.push({ url, init });
          return json({ unreadCount: 1, items: [item] });
        },
      );
      assert.equal(
        (await inbox.loadAdminNotificationInbox()).items[0].emergencyAlertId,
        "alert-1",
      );
      await inbox.markAdminNotificationRead(item.id);
      assert.equal(calls[1].url, "/notifications/admin/me/notice-1/read");
      assert.equal(calls[1].init.method, "PATCH");
      assert(
        !calls.some(
          (c) => c.url.includes("acknowledge") || c.url.includes("resolve"),
        ),
      );
    },
  );
  await check(
    "Emergency inbox rejects mismatched incident references",
    async () => {
      const item = {
        ...notification,
        eventType: "DRIVER_EMERGENCY_ALERT",
        emergencyAlertId: "alert-1",
        emergencyAlert: { id: "different", status: "OPEN", createdAt: time },
      };
      const inbox = sourceModule("services/admin-notifications.ts", async () =>
        json({ unreadCount: 1, items: [item] }),
      );
      await assert.rejects(() => inbox.loadAdminNotificationInbox());
    },
  );
  await check(
    "Emergency list and detail parse missing location without inventing one",
    async () => {
      const calls = [];
      const client = api.createAdminSafetyClient(async (url) => {
        calls.push(url);
        return json(
          url.includes("?")
            ? { items: [emergency], nextCursor: "older-1" }
            : emergency,
        );
      });
      const page = await client.emergencies("OPEN", "cursor-1");
      assert.equal(page.items[0].latitude, null);
      assert.equal(page.nextCursor, "older-1");
      assert.equal(
        (await client.emergency("alert-1")).events[0].action,
        "CREATED",
      );
      assert.equal(
        calls[0],
        "/emergencies/admin?limit=25&status=OPEN&cursor=cursor-1",
      );
    },
  );
  await check(
    "Malformed emergency state and coordinates cannot enable response controls",
    async () => {
      for (const changed of [
        { status: "UNKNOWN" },
        { status: "RESOLVED" },
        { latitude: 91, longitude: 0, locationRecordedAt: time },
        { latitude: 0 },
        { driver: null },
      ]) {
        const client = api.createAdminSafetyClient(async () =>
          json({ ...emergency, ...changed }),
        );
        await assert.rejects(() => client.emergency("alert-1"));
      }
    },
  );
  await check(
    "Acknowledgement and resolution use dedicated routes with only trimmed notes",
    async () => {
      const calls = [];
      const client = api.createAdminSafetyClient(async (url, init) => {
        calls.push({ url, init });
        return json({
          ...emergency,
          status: url.endsWith("/resolve") ? "RESOLVED" : "ACKNOWLEDGED",
          acknowledgedAt: time,
          resolvedAt: url.endsWith("/resolve") ? time : null,
        });
      });
      await client.acknowledge("alert-1", " Contacting driver ");
      await client.resolve("alert-1", " Safe outcome ");
      assert.equal(calls[0].url, "/emergencies/admin/alert-1/acknowledge");
      assert.equal(calls[1].url, "/emergencies/admin/alert-1/resolve");
      assert.deepEqual(JSON.parse(calls[1].init.body), {
        note: "Safe outcome",
      });
      assert.equal(calls[1].init.method, "PATCH");
      assert.throws(() => client.resolve("alert-1", "   "));
      assert.equal(calls.length, 2);
    },
  );
  await check(
    "Feedback review preserves expected version and excludes client actor identity",
    async () => {
      let body;
      const client = api.createAdminSafetyClient(async (url, init) => {
        if (init.body) body = JSON.parse(init.body);
        return json(feedback);
      });
      const item = await client.feedbackDetail("feedback-1");
      await client.review(item, "FOLLOW_UP", " Investigate ");
      assert.deepEqual(body, {
        expectedStatus: "NEW",
        expectedUpdatedAt: time,
        status: "FOLLOW_UP",
        note: "Investigate",
      });
      assert.throws(() =>
        client.review(
          { ...item, reviewStatus: "CLOSED" },
          "REVIEWED",
          "Invalid transition",
        ),
      );
    },
  );
  await check(
    "Feedback parser rejects invalid ratings and retains absent optional scores",
    async () => {
      const client = api.createAdminSafetyClient(async () =>
        json({ items: [feedback], nextCursor: null }),
      );
      assert.equal(
        (await client.feedback("NEW")).items[0].customerCareRating,
        null,
      );
      const bad = api.createAdminSafetyClient(async () =>
        json({ ...feedback, overallRating: 6 }),
      );
      await assert.rejects(() => bad.feedbackDetail("feedback-1"));
    },
  );
  await check(
    "Invalid identifiers are rejected before a network request",
    async () => {
      let calls = 0;
      const client = api.createAdminSafetyClient(async () => {
        calls++;
        return json(emergency);
      });
      assert.throws(() => client.emergency("../other"));
      assert.equal(calls, 0);
    },
  );
  await check(
    "HTTP failures expose safe messages and never raw response content",
    async () => {
      for (const status of [400, 401, 403, 404, 409, 429, 500]) {
        const client = api.createAdminSafetyClient(
          async () => new Response("PRIVATE_SERVER_DETAIL", { status }),
        );
        await assert.rejects(
          () => client.emergency("alert-1"),
          (error) =>
            error.status === status &&
            !error.message.includes("PRIVATE_SERVER_DETAIL"),
        );
      }
    },
  );
  await check(
    "Timeout settles even if the fetch implementation ignores cancellation",
    async () => {
      let signal;
      const client = api.createAdminSafetyClient(async (_url, init) => {
        signal = init.signal;
        return new Promise(() => {});
      }, 20);
      await assert.rejects(
        () => client.emergency("alert-1"),
        (error) => error.message.includes("timed out"),
      );
      assert.equal(signal.aborted, true);
    },
  );
  await check("Aborted screen requests cannot return late data", async () => {
    let finish;
    const client = api.createAdminSafetyClient(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = client.emergency("alert-1", controller.signal);
    controller.abort();
    await assert.rejects(
      () => pending,
      (error) => error.message.includes("cancelled"),
    );
    finish(json(emergency));
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await assert.rejects(() =>
      client.emergency("alert-1", alreadyAborted.signal),
    );
  });
  const mapCore = sourceModule("services/emergency-map-core.ts");
  const fleet = (driverId, changed = {}) => ({
    id: "gps-1",
    driverId,
    latitude: -9.44,
    longitude: 147.18,
    accuracy: 12,
    recordedAt: time,
    driver: { id: driverId, isOnline: true },
    ...changed,
  });
  await check(
    "Emergency location source is compatible with legacy, GPS and manually selected pins",
    async () => {
      for (const source of [undefined, "GPS", "MANUAL_PIN", "unexpected"]) {
        const client = api.createAdminSafetyClient(async () =>
          json({ ...emergency, locationSource: source }),
        );
        const item = await client.emergency("alert-1");
        assert.equal(
          item.locationSource,
          source === "GPS" || source === "MANUAL_PIN" ? source : null,
        );
      }
    },
  );
  await check(
    "Fleet lookup returns only the selected Driver and strips unrelated/private data",
    async () => {
      const client = api.createAdminSafetyClient(async (route, init) => {
        assert.equal(route, "/driver-locations/fleet");
        assert.equal(init.cache, undefined);
        assert.equal(
          new Headers(init.headers).get("Cache-Control"),
          "no-store",
        );
        return json([
          fleet("driver-other"),
          fleet("driver-1", { privateNote: "PRIVATE" }),
        ]);
      });
      const item = await client.latestDriverLocation("driver-1");
      assert.equal(item.driverId, "driver-1");
      assert.equal(item.source, "FLEET_GPS");
      assert.equal(item.privateNote, undefined);
      assert.equal(item.driver, undefined);
      assert(!JSON.stringify(item).includes("driver-other"));
    },
  );
  await check(
    "Fleet identity mismatch or malformed selected coordinates cannot create a marker",
    async () => {
      for (const changed of [
        { driver: { id: "driver-other" } },
        { latitude: 91 },
        { longitude: null },
        { recordedAt: "invalid" },
      ]) {
        const client = api.createAdminSafetyClient(async () =>
          json([fleet("driver-1", changed)]),
        );
        await assert.rejects(() => client.latestDriverLocation("driver-1"));
      }
      const client = api.createAdminSafetyClient(async () =>
        json([fleet("driver-other")]),
      );
      assert.equal(await client.latestDriverLocation("driver-1"), null);
    },
  );
  await check(
    "No-location alerts never acquire an invented incident point; zero coordinates remain valid",
    async () => {
      assert.equal(mapCore.incidentPoint(emergency), null);
      const item = {
        ...emergency,
        latitude: 0,
        longitude: 0,
        locationRecordedAt: time,
        locationSource: "GPS",
      };
      assert.equal(mapCore.incidentPoint(item).latitude, 0);
      assert.equal(mapCore.latestLocationForDriver([], "driver-1"), null);
      assert.throws(() => mapCore.latestLocationForDriver({}, "driver-1"));
    },
  );
  await check(
    "Manual pin has no GPS radius even if a malformed response supplies accuracy",
    async () => {
      const point = mapCore.incidentPoint({
        ...emergency,
        latitude: -9,
        longitude: 147,
        locationRecordedAt: time,
        locationSource: "MANUAL_PIN",
        accuracyMeters: 20,
      });
      assert.equal(point.source, "MANUAL_PIN");
      assert.equal(point.accuracyMeters, null);
      assert.equal(mapCore.accuracyRadius(point), null);
      const gps = { ...point, source: "FLEET_GPS", accuracyMeters: 20 };
      assert.equal(mapCore.accuracyRadius(gps), 20);
      assert.equal(
        mapCore.accuracyRadius({ ...gps, accuracyMeters: 1000000000 }),
        null,
      );
      assert.equal(mapCore.accuracyRadius({ ...gps, source: "UNKNOWN" }), null);
    },
  );
  await check(
    "Future timestamps, stale telemetry and fixed manual pins have explicit age/source labels",
    async () => {
      const point = {
        latitude: -9,
        longitude: 147,
        recordedAt: time,
        accuracyMeters: 20,
        source: "FLEET_GPS",
      };
      assert.equal(
        mapCore.pointAge(point, Date.parse(time) + 60001).stale,
        true,
      );
      assert.equal(mapCore.pointAge(point, Date.parse(time) - 1).seconds, null);
      assert.match(
        mapCore.pointDescription(point, Date.parse(time) - 1),
        /age unknown/,
      );
      assert.match(
        mapCore.pointDescription({ ...point, source: "MANUAL_PIN" }),
        /not live GPS/,
      );
      assert.match(
        mapCore.pointDescription({ ...point, source: "UNKNOWN" }),
        /source unknown/,
      );
    },
  );
  await check(
    "Moving latest GPS never replaces or mutates the immutable incident point",
    async () => {
      const alert = Object.freeze({
        ...emergency,
        latitude: -9.4,
        longitude: 147.1,
        locationRecordedAt: time,
        locationSource: "MANUAL_PIN",
      });
      const incident = mapCore.incidentPoint(alert);
      const first = mapCore.latestLocationForDriver(
        [fleet("driver-1")],
        "driver-1",
      );
      const second = mapCore.latestLocationForDriver(
        [fleet("driver-1", { latitude: -9.5 })],
        "driver-1",
      );
      assert.notEqual(first.latitude, second.latitude);
      assert.equal(mapCore.incidentPoint(alert).latitude, -9.4);
      assert.equal(incident.latitude, -9.4);
      assert.equal(mapCore.samePoint(incident, second), false);
      assert.equal(mapCore.samePoint(incident, { ...incident }), true);
    },
  );
  await check(
    "Repeated fleet rows choose newest valid report; invalid identity is never silently substituted",
    async () => {
      const newer = new Date(Date.parse(time) + 15000).toISOString();
      const result = mapCore.latestLocationForDriver(
        [
          fleet("driver-1"),
          fleet("driver-1", { latitude: -9.5, recordedAt: newer }),
        ],
        "driver-1",
      );
      assert.equal(result.latitude, -9.5);
      assert.throws(() =>
        mapCore.latestLocationForDriver(
          [fleet("driver-1"), fleet("driver-1", { latitude: NaN })],
          "driver-1",
        ),
      );
    },
  );
  await check(
    "Fleet cancellation cannot populate a departed emergency screen or disclose response details",
    async () => {
      let finish;
      const client = api.createAdminSafetyClient(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const controller = new AbortController();
      const pending = client.latestDriverLocation(
        "driver-1",
        controller.signal,
      );
      controller.abort();
      await assert.rejects(() => pending, /cancelled/);
      finish(json([fleet("driver-1")]));
      const refused = api.createAdminSafetyClient(
        async () => new Response("PRIVATE_DETAIL", { status: 403 }),
      );
      await assert.rejects(
        () => refused.latestDriverLocation("driver-1"),
        (e) => !e.message.includes("PRIVATE_DETAIL"),
      );
    },
  );
  await check(
    "Only ride-linked vehicles are labelled; active registrations are not incident proof",
    async () => {
      assert.match(
        mapCore.incidentVehicleLabel({
          ...emergency,
          driver: {
            ...emergency.driver,
            vehicles: [{ plateNumber: "ACTIVE" }],
          },
        }),
        /unconfirmed/,
      );
      assert.match(
        mapCore.incidentVehicleLabel({
          ...emergency,
          ride: { vehicle: { plateNumber: "TEST" } },
        }),
        /Ride-linked vehicle: TEST/,
      );
      assert.match(
        mapCore.incidentVehicleLabel({
          ...emergency,
          ride: { vehicle: { plateNumber: "TEST" } },
        }),
        /confirm with the Driver/,
      );
    },
  );
  assert.deepEqual(plain(api.reviewTransitions.CLOSED), ["FOLLOW_UP"]);
  console.log(
    `${count} offline Admin safety contract checks passed. No network or database used.`,
  );
}
main().catch(() => {
  console.error(`FAIL: ${stage}. Raw details withheld.`);
  process.exitCode = 1;
});
