"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { Buffer: NodeBuffer } = require("node:buffer");
const root = process.cwd();
let net = async () => {
  throw Error("Unexpected network");
};
function load(file, imports) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (!(name in imports)) throw Error("Unexpected import");
        return imports[name];
      },
      AbortController,
      setTimeout,
      clearTimeout,
      fetch: (...args) => net(...args),
    },
    { filename: file },
  );
  return module.exports;
}
const core = load("services/rider-feedback-core.ts", {});
const storageCore = load("services/feedback-draft-store.ts", {
  "./rider-feedback-core": core,
});
const ride = {
  id: "ride-1",
  status: "COMPLETED",
  driver: { id: "driver-1", fullName: "Fixture Driver" },
};
const input = { overallRating: 5, customerCareRating: 4, comment: "Good care" };
const feedback = {
  id: "feedback-1",
  rideId: "ride-1",
  overallRating: 5,
  customerCareRating: 4,
  professionalismRating: null,
  drivingRating: null,
  cleanlinessRating: null,
  comment: "Good care",
  createdAt: "2026-09-30T00:00:00.000Z",
};
function memory() {
  const data = new Map();
  return {
    data,
    store: {
      read: async (key) => data.get(key) ?? null,
      write: async (key, value) => {
        data.set(key, value);
      },
      remove: async (key) => {
        data.delete(key);
      },
    },
  };
}
function server() {
  let saved = null;
  const posts = [];
  return {
    posts,
    setSaved: (v) => {
      saved = v;
    },
    request: async (owner, route, init = {}) => {
      if (route.startsWith("/rides/me/")) return ride;
      if (init.method === "POST") {
        posts.push({ owner, route, body: JSON.parse(init.body) });
        saved = feedback;
        return saved;
      }
      return { feedback: saved };
    },
  };
}
let passed = 0,
  stage = "";
async function test(name, work) {
  stage = name;
  await work();
  passed++;
  console.log(`PASS: ${name}`);
}
(async () => {
  await test("All rating boundaries and optional omissions", async () => {
    for (const key of [
      "overallRating",
      "customerCareRating",
      "professionalismRating",
      "drivingRating",
      "cleanlinessRating",
    ]) {
      for (const value of [1, 5])
        assert.equal(
          core.ratings({ overallRating: 3, [key]: value })[key],
          value,
        );
      for (const value of [0, 6, 1.5, "5", NaN])
        assert.throws(() => core.ratings({ overallRating: 3, [key]: value }));
    }
    const v = core.ratings({ overallRating: 3, customerCareRating: null });
    assert.equal(v.customerCareRating, undefined);
    assert.throws(() => core.ratings({}));
  });
  await test("Comment bound, trimming and actor fields excluded", async () => {
    assert.equal(
      core.ratings({ overallRating: 3, comment: "  " }).comment,
      undefined,
    );
    assert.equal(
      core.ratings({ overallRating: 3, comment: " a " }).comment,
      "a",
    );
    assert.equal(
      core.ratings({ overallRating: 3, comment: "x".repeat(1000) }).comment
        .length,
      1000,
    );
    assert.throws(() =>
      core.ratings({ overallRating: 3, comment: "x".repeat(1001) }),
    );
    assert.equal(
      core.ratings({
        overallRating: 3,
        riderId: "hostile",
        driverId: "hostile",
        reviewStatus: "CLOSED",
      }).riderId,
      undefined,
    );
  });
  await test("Owned completed ride checked before submit and save precedes POST", async () => {
    const m = memory(),
      s = server();
    let wasSaved = false;
    const c = core.createFeedbackClient(m.store, async (owner, route, init) => {
      if (init?.method === "POST") wasSaved = m.data.size === 1;
      return s.request(owner, route, init);
    });
    await c.submit("rider-a", "ride-1", input);
    assert.equal(wasSaved, true);
    assert.equal(s.posts.length, 1);
    assert.equal(m.data.size, 0);
    assert.equal(s.posts[0].body.riderId, undefined);
    assert.equal(s.posts[0].body.driverId, undefined);
  });
  await test("Cancelled, active and unassigned completed rides cannot submit", async () => {
    for (const status of [
      "REQUESTED",
      "ACCEPTED",
      "DRIVER_ARRIVED",
      "IN_PROGRESS",
      "CANCELLED",
    ]) {
      const m = memory(),
        s = server(),
        c = core.createFeedbackClient(m.store, async (owner, route, init) =>
          route.startsWith("/rides/me/")
            ? { ...ride, status }
            : s.request(owner, route, init),
        );
      await assert.rejects(c.submit("rider-a", "ride-1", input));
      assert.equal(s.posts.length, 0);
      assert.equal(m.data.size, 0);
    }
    const m = memory(),
      s = server(),
      c = core.createFeedbackClient(m.store, async (owner, route, init) =>
        route.startsWith("/rides/me/")
          ? { ...ride, driver: null }
          : s.request(owner, route, init),
      );
    await assert.rejects(c.submit("rider-a", "ride-1", input));
    assert.equal(s.posts.length, 0);
  });
  await test("Wrong ride response and invalid links rejected", async () => {
    let calls = 0;
    const c = core.createFeedbackClient(memory().store, async () => {
      calls++;
      return { ...ride, id: "other-ride" };
    });
    await assert.rejects(c.load("rider-a", "../secret"));
    assert.equal(calls, 0);
    await assert.rejects(c.load("rider-a", "ride-1"));
  });
  await test("Storage failure blocks POST", async () => {
    const s = server(),
      c = core.createFeedbackClient(
        {
          read: async () => null,
          write: async () => {
            throw Error("Disk failure");
          },
          remove: async () => {},
        },
        s.request,
      );
    await assert.rejects(c.submit("rider-a", "ride-1", input));
    assert.equal(s.posts.length, 0);
  });
  await test("Lost reply and app restart confirm existing server record", async () => {
    const m = memory(),
      s = server();
    let lost = true;
    const request = async (owner, route, init) => {
      const r = await s.request(owner, route, init);
      if (init?.method === "POST" && lost) {
        lost = false;
        throw Error("Lost reply");
      }
      return r;
    };
    await assert.rejects(
      core
        .createFeedbackClient(m.store, request)
        .submit("rider-a", "ride-1", input),
    );
    assert.equal(m.data.size, 1);
    const state = await core
      .createFeedbackClient(m.store, request)
      .load("rider-a", "ride-1");
    assert.equal(state.feedback.id, "feedback-1");
    assert.equal(m.data.size, 0);
    assert.equal(s.posts.length, 1);
  });
  await test("Unreceived submission restarts and retries identical body", async () => {
    const m = memory(),
      s = server();
    let attempt;
    const failed = core.createFeedbackClient(
      m.store,
      async (owner, route, init) => {
        if (init?.method === "POST") {
          attempt = init.body;
          throw Error("Offline");
        }
        return s.request(owner, route, init);
      },
    );
    await assert.rejects(failed.submit("rider-a", "ride-1", input));
    const c = core.createFeedbackClient(m.store, s.request);
    await assert.rejects(c.submit("rider-a", "ride-1", { overallRating: 1 }));
    assert.equal(s.posts.length, 0);
    await c.submit("rider-a", "ride-1", undefined);
    assert.equal(JSON.stringify(s.posts[0].body), attempt);
  });
  await test("Other-device feedback is displayed without a second POST", async () => {
    const m = memory(),
      s = server();
    s.setSaved({ ...feedback, overallRating: 1 });
    const value = await core
      .createFeedbackClient(m.store, s.request)
      .submit("rider-a", "ride-1", input);
    assert.equal(value.overallRating, 1);
    assert.equal(s.posts.length, 0);
  });
  await test("Pending records isolated by Rider and ride", async () => {
    const m = memory(),
      s = server();
    m.data.set(
      "joyride-feedback-v1-rider-a-ride-1",
      JSON.stringify({ riderId: "rider-a", rideId: "ride-1", payload: input }),
    );
    const c = core.createFeedbackClient(m.store, s.request);
    assert.equal((await c.load("rider-b", "ride-1")).pending, null);
    m.data.set(
      "joyride-feedback-v1-rider-b-ride-1",
      m.data.get("joyride-feedback-v1-rider-a-ride-1"),
    );
    await assert.rejects(c.load("rider-b", "ride-1"));
    assert.ok(m.data.has("joyride-feedback-v1-rider-b-ride-1"));
  });
  await test("Concurrent taps produce one POST", async () => {
    const m = memory(),
      s = server();
    let release;
    const c = core.createFeedbackClient(m.store, async (owner, route, init) => {
      if (init?.method === "POST") {
        s.posts.push(init);
        return new Promise((r) => {
          release = r;
        });
      }
      return s.request(owner, route, init);
    });
    const first = c.submit("rider-a", "ride-1", input);
    await new Promise((r) => setTimeout(r, 0));
    await assert.rejects(c.submit("rider-a", "ride-1", input));
    assert.equal(s.posts.length, 1);
    release(feedback);
    await first;
  });
  await test("Malformed or mismatched confirmation retains pending body", async () => {
    for (const bad of [
      { ...feedback, rideId: "other" },
      { ...feedback, overallRating: 0 },
      { ...feedback, overallRating: 1 },
    ]) {
      const m = memory(),
        s = server(),
        c = core.createFeedbackClient(m.store, async (owner, route, init) =>
          init?.method === "POST" ? bad : s.request(owner, route, init),
        );
      await assert.rejects(c.submit("rider-a", "ride-1", input));
      assert.equal(m.data.size, 1);
    }
    const parsed = core.parseFeedback(
      { ...feedback, reviewEvents: ["private"], reviewStatus: "NEW" },
      "ride-1",
    );
    assert.equal(parsed.reviewEvents, undefined);
  });
  await test("Unicode comments persist in small chunks and clear after confirmation", async () => {
    const m = memory(),
      store = storageCore.createDraftStore(m.store, () => "revision-1");
    const long = JSON.stringify({ comment: "😀".repeat(500) });
    await store.write("fixture", long);
    assert.equal(await store.read("fixture"), long);
    for (const value of m.data.values())
      assert.ok(NodeBuffer.byteLength(value, "utf8") < 2048);
    await store.remove("fixture");
    assert.equal(m.data.size, 0);
  });
  await test("Partial draft write never commits an index or overwrites existing draft", async () => {
    const m = memory();
    let writes = 0;
    const store = storageCore.createDraftStore(
      {
        ...m.store,
        write: async (k, v) => {
          if (++writes === 2) throw Error("Disk");
          await m.store.write(k, v);
        },
      },
      () => "revision-2",
    );
    await assert.rejects(store.write("fixture", "x".repeat(1000)));
    assert.equal(await store.read("fixture"), null);
    const complete = storageCore.createDraftStore(m.store, () => "revision-3");
    await complete.write("fixture", "original");
    await assert.rejects(complete.write("fixture", "replacement"));
    assert.equal(await complete.read("fixture"), "original");
    const uncertain = memory();
    const uncertainStore = storageCore.createDraftStore(
      {
        ...uncertain.store,
        write: async (key, value) => {
          await uncertain.store.write(key, value);
          if (key === "committed") throw Error("Completion lost");
        },
      },
      () => "revision-5",
    );
    await assert.rejects(uncertainStore.write("committed", "original"));
    assert.equal(await uncertainStore.read("committed"), "original");
    await assert.rejects(uncertainStore.write("committed", "replacement"));
  });
  await test("Missing chunks and corrupted index fail safely", async () => {
    const m = memory(),
      store = storageCore.createDraftStore(m.store, () => "revision-4");
    await store.write("fixture", "original");
    m.data.delete("fixture-revision-4-0");
    await assert.rejects(store.read("fixture"));
    assert.ok(m.data.has("fixture"));
    m.data.set("fixture", "broken");
    await assert.rejects(store.read("fixture"));
    assert.equal(m.data.get("fixture"), "broken");
  });
  let session = { rider: { id: "rider-a" }, accessToken: "fixture-token" };
  const binding = load("services/rider-feedback.ts", {
    "@/constants/api": { API_BASE_URL: "https://fixture.invalid" },
    "@/services/rider-session": { loadRiderSession: async () => session },
    "expo-secure-store": {},
    "react-native": { Platform: { OS: "android" } },
    "./rider-feedback-core": core,
    "./feedback-draft-store": storageCore,
  });
  await test("Transport prevents changed account or expired session network use", async () => {
    let calls = 0;
    net = async () => {
      calls++;
      return { ok: true, json: async () => feedback };
    };
    await assert.rejects(
      binding.createFeedbackRequest()("rider-b", "/fixture"),
    );
    session = null;
    await assert.rejects(
      binding.createFeedbackRequest()("rider-a", "/fixture"),
    );
    assert.equal(calls, 0);
    session = { rider: { id: "rider-a" }, accessToken: "fixture-token" };
  });
  await test("Timeout settles and cancellation prevents sending", async () => {
    net = async () => new Promise(() => {});
    await assert.rejects(
      binding.createFeedbackRequest(15)("rider-a", "/fixture"),
      /No confirmation/,
    );
    let calls = 0;
    net = async () => {
      calls++;
      return { ok: true, json: async () => feedback };
    };
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      binding.createFeedbackRequest()("rider-a", "/fixture", {
        signal: ac.signal,
      }),
    );
    assert.equal(calls, 0);
  });
  await test("HTTP errors withhold raw response contents", async () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500]) {
      net = async () => ({
        ok: false,
        status,
        json: async () => ({ message: "PRIVATE_MARKER" }),
      });
      await assert.rejects(
        binding.createFeedbackRequest()("rider-a", "/fixture"),
        (e) => !e.message.includes("PRIVATE_MARKER"),
      );
    }
  });
  console.log(
    `PASS: ${passed} offline Rider feedback checks. No network or database connection.`,
  );
})().catch(() => {
  console.error(`FAIL: ${stage}. Raw details withheld.`);
  process.exitCode = 1;
});
