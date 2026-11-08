const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.dirname(require.resolve('../package.json'));
const source = fs.readFileSync(
  path.join(root, 'services/offline-telemetry.ts'), 'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});

async function settle() {
  for (let index = 0; index < 50; index++) await Promise.resolve();
}

async function harness() {
  const calls = {
    resume: 0, pause: 0, session: 0, dispose: 0,
    flush: 0, writes: 0, enqueues: [], requests: [],
  };
  const removed = { network: false, app: false, session: false };
  let networkListener;
  let appListener;
  let sessionListener;
  let dependencies;
  let response = {
    ok: true,
    json: async () => ({ acceptedIds: ['synthetic_point_00000001'] }),
  };

  class QueueStub {
    constructor(value) { dependencies = value; }
    resume() { calls.resume++; }
    pause() { calls.pause++; }
    sessionChanged() { calls.session++; }
    dispose() { calls.dispose++; }
    async flush() { calls.flush++; }
    async enqueue(point) {
      calls.enqueues.push(point);
      return true;
    }
  }

  const network = {
    addEventListener(listener) {
      networkListener = listener;
      return () => { removed.network = true; };
    },
    fetch: async () => ({
      isConnected: false, isInternetReachable: false,
    }),
  };
  const storage = {
    getItem: async () => null,
    setItem: async () => { calls.writes++; },
  };
  const modules = {
    '@react-native-async-storage/async-storage': storage,
    '@react-native-community/netinfo': network,
    'react-native': {
      AppState: {
        currentState: 'active',
        addEventListener(event, listener) {
          assert.equal(event, 'change');
          appListener = listener;
          return { remove() { removed.app = true; } };
        },
      },
    },
    '../constants/api': { API_BASE_URL: 'https://synthetic.invalid/' },
    './driver-session': {
      loadDriverSession: async () => ({
        driver: { id: 'synthetic-driver' },
        accessToken: 'synthetic-token',
        expiresAt: Date.now() + 60000,
      }),
      subscribeToDriverSession(listener) {
        sessionListener = listener;
        return () => { removed.session = true; };
      },
    },
    './offline-telemetry-queue': { OfflineTelemetryQueue: QueueStub },
  };

  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: moduleObject,
    exports: moduleObject.exports,
    require(name) {
      if (!(name in modules)) throw new Error('Unexpected dependency');
      return modules[name];
    },
    fetch: async (url, options) => {
      calls.requests.push({ url, options });
      return response;
    },
  }, { filename: 'offline-telemetry.js' });

  const service = moduleObject.exports.offlineTelemetryService;
  await settle();

  return {
    service, calls, removed,
    dependencies: () => dependencies,
    network(connected, reachable = true) {
      networkListener({
        isConnected: connected,
        isInternetReachable: reachable,
      });
    },
    app(state) { appListener(state); },
    sessionChanged() { sessionListener(null); },
    response(value) { response = value; },
  };
}

let passed = 0;
let current = 'Preparing wrapper checks';

async function test(name, work) {
  current = name;
  const h = await harness();
  try {
    await work(h);
    passed++;
    console.log('PASS:', name);
  } finally {
    h.service.dispose();
  }
}

async function main() {
  await test('Disconnected startup does not enable delivery', async h => {
    assert.equal(h.calls.resume, 0);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.writes, 0);
  });

  await test('Connectivity enables delivery once per transition', async h => {
    h.network(true);
    h.network(true);
    assert.equal(h.calls.resume, 1);
    h.network(false);
    assert.equal(h.calls.pause, 1);
    h.network(true);
    assert.equal(h.calls.resume, 2);
  });

  await test('Unreachable internet does not enable delivery', async h => {
    h.network(true, false);
    assert.equal(h.calls.resume, 0);
  });

  await test('Background pauses and foreground resumes delivery', async h => {
    h.network(true);
    h.app('background');
    assert.equal(h.calls.pause, 1);
    h.app('active');
    assert.equal(h.calls.resume, 2);
  });

  await test('Session adapter supplies the authenticated owner', async h => {
    const owner = await h.dependencies().session();
    assert.equal(owner.driverId, 'synthetic-driver');
    assert.equal(owner.accessToken, 'synthetic-token');
    assert.ok(owner.expiresAt > Date.now());
  });

  await test('Upload uses captured authentication and history-only endpoint', async h => {
    const owner = {
      driverId: 'synthetic-driver',
      accessToken: 'captured-synthetic-token',
      expiresAt: Date.now() + 60000,
    };
    const point = {
      id: 'synthetic_point_00000001',
      rideId: 'synthetic-ride',
      latitude: -9.44, longitude: 147.18,
      recordedAt: new Date().toISOString(),
    };
    const controller = new globalThis.AbortController();
    await h.dependencies().send(owner, [point], controller.signal);
    const request = h.calls.requests[0];
    assert.equal(
      request.url,
      'https://synthetic.invalid/driver-locations/history/batch',
    );
    assert.equal(request.options.method, 'POST');
    assert.equal(
      request.options.headers.Authorization,
      'Bearer captured-synthetic-token',
    );
    assert.equal(request.options.signal, controller.signal);
    const body = JSON.parse(request.options.body);
    assert.equal(body.points[0].rideId, point.rideId);
    assert.equal('driverId' in body, false);
    assert.equal('status' in body.points[0], false);
  });

  await test('Rejected upload is surfaced without changing login', async h => {
    h.response({ ok: false });
    await assert.rejects(() => h.dependencies().send({
      driverId: 'synthetic-driver',
      accessToken: 'synthetic-token',
      expiresAt: Date.now() + 60000,
    }, [], new globalThis.AbortController().signal));
    assert.equal(h.calls.session, 0);
  });

  await test('Malformed acknowledgement is rejected', async h => {
    h.response({ ok: true, json: async () => ({ acceptedIds: [42] }) });
    await assert.rejects(() => h.dependencies().send({
      driverId: 'synthetic-driver',
      accessToken: 'synthetic-token',
      expiresAt: Date.now() + 60000,
    }, [], new globalThis.AbortController().signal));
  });

  await test('Caller timestamp becomes history timestamp without ride-status mutation', async h => {
    const timestamp = new Date().toISOString();
    await h.service.enqueuePoint({
      rideId: 'synthetic-ride',
      latitude: -9.44, longitude: 147.18,
      timestamp, status: 'IN_PROGRESS',
    });
    assert.equal(h.calls.enqueues.length, 1);
    const point = h.calls.enqueues[0];
    assert.equal(point.recordedAt, timestamp);
    assert.equal('status' in point, false);
    assert.match(point.id, /^[A-Za-z0-9_-]{16,100}$/);
  });

  await test('Session change resets visible status and invalidates queue work', async h => {
    h.dependencies().report('queued', 3);
    h.sessionChanged();
    assert.equal(h.calls.session, 1);
    assert.equal(h.service.getStatus().event, 'idle');
    assert.equal(h.service.getStatus().pending, null);
  });

  await test('Status reports contain no token, driver, or coordinates', async h => {
    h.dependencies().report('retrying', 2);
    const status = h.service.getStatus();
    assert.equal(status.event, 'retrying');
    assert.equal(status.pending, 2);
    assert.deepEqual(Object.keys(status).sort(), [
      'event', 'pending', 'updatedAt',
    ]);
  });

  await test('A failing status subscriber does not interrupt other subscribers', async h => {
    h.service.subscribe(() => { throw new Error('Synthetic subscriber'); });
    let observed = false;
    h.service.subscribe(status => {
      if (status.event === 'delivered') observed = true;
    });
    h.dependencies().report('delivered', 0);
    assert.equal(observed, true);
  });

  await test('Manual flush delegates without bypassing queue safeguards', async h => {
    await h.service.flushQueue();
    assert.equal(h.calls.flush, 1);
  });

  await test('Disposal removes listeners and prevents further enqueue', async h => {
    h.service.dispose();
    assert.equal(h.removed.network, true);
    assert.equal(h.removed.app, true);
    assert.equal(h.removed.session, true);
    assert.equal(h.calls.dispose, 1);
    await h.service.enqueuePoint({
      rideId: 'synthetic-ride',
      latitude: -9.44, longitude: 147.18,
      timestamp: new Date().toISOString(), status: 'IN_PROGRESS',
    });
    assert.equal(h.calls.enqueues.length, 0);
    h.service.dispose();
    assert.equal(h.calls.dispose, 1);
  });


  await test('Manual retry respects network and foreground eligibility', async h => {
    h.service.retryQueue();
    assert.equal(h.calls.resume, 0);
    h.network(true);
    assert.equal(h.calls.resume, 1);
    h.service.retryQueue();
    assert.equal(h.calls.resume, 2);
    h.app('background');
    h.service.retryQueue();
    assert.equal(h.calls.resume, 2);
  });

  await test('Newly queued points do not hide an unresolved delivery warning', async h => {
    for (const event of [
      'retrying', 'needs-attention', 'queue-full', 'storage-error',
    ]) {
      h.dependencies().report(event, 2);
      h.dependencies().report('queued', 3);
      assert.equal(h.service.getStatus().event, event);
      assert.equal(h.service.getStatus().pending, 3);
    }
    h.dependencies().report('delivered', 0);
    assert.equal(h.service.getStatus().event, 'delivered');
  });

  console.log('Passed telemetry wrapper checks:', passed);
  console.log('HTTP and platform dependencies simulated; no network requests.');
}

main().catch(() => {
  console.log('STOP: Wrapper regression case:', current);
  console.log('Passed checks:', passed);
  console.log('Raw errors and synthetic argument values withheld.');
  process.exitCode = 1;
});
