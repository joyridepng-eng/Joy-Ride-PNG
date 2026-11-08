const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.dirname(require.resolve('../package.json'));
const source = fs.readFileSync(
  path.join(root, 'services/offline-telemetry-queue.ts'), 'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
  reportDiagnostics: true,
});
assert.equal(
  (compiled.diagnostics || []).filter(
    item => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

async function settle() {
  for (let index = 0; index < 100; index++) await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  let now = Date.now();
  let sequence = 0;
  const timers = new Map();
  const storage = new Map();
  const events = [];
  const calls = [];
  let session = {
    driverId: 'synthetic-driver-a',
    accessToken: 'synthetic-token-a',
    expiresAt: now + 86400000,
  };
  let sender = async (owner, points) => ({
    acceptedIds: points.map(point => point.id),
  });
  let failWrites = false;

  class ClockDate extends Date {
    static now() { return now; }
  }

  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: moduleObject,
    exports: moduleObject.exports,
    Date: ClockDate,
    AbortController: globalThis.AbortController,
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  }, { filename: 'offline-telemetry-queue.js' });

  const queue = new moduleObject.exports.OfflineTelemetryQueue({
    read: async key => storage.get(key) ?? null,
    write: async (key, value) => {
      if (failWrites) throw new Error('Synthetic storage failure');
      storage.set(key, value);
    },
    session: async () => session ? { ...session } : null,
    send: async (owner, points, signal) => {
      calls.push({
        owner: { ...owner },
        points: JSON.parse(JSON.stringify(points)),
        signal,
      });
      return sender(owner, points, signal);
    },
    report: (event, pending) => events.push({ event, pending }),
  });

  function key(driverId = 'synthetic-driver-a') {
    return 'joyride.telemetry.owned.v1:' + encodeURIComponent(driverId);
  }
  function points(driverId) {
    const raw = storage.get(key(driverId));
    return raw ? JSON.parse(raw).points : [];
  }
  function point(index = 1) {
    return {
      id: 'synthetic_point_' + String(index).padStart(8, '0'),
      rideId: 'synthetic-ride',
      latitude: -9.44,
      longitude: 147.18,
      recordedAt: new Date(now - 1000).toISOString(),
    };
  }
  async function advance(milliseconds) {
    const target = now + milliseconds;
    for (let guard = 0; guard < 1000; guard++) {
      await settle();
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) {
        now = target;
        await settle();
        return;
      }
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    throw new Error('Synthetic timer loop exceeded');
  }

  return {
    queue, storage, events, calls, points, point, key, advance,
    send(value) { sender = value; },
    session(value) { session = value; },
    owner() { return session ? { ...session } : null; },
    failWrites(value) { failWrites = value; },
  };
}

let passed = 0;
let current = 'Preparing checks';

async function test(name, work) {
  current = name;
  const h = harness();
  try {
    await work(h);
    passed++;
    console.log('PASS:', name);
  } finally {
    h.queue.dispose();
    await settle();
  }
}

async function main() {
  await test('Concurrent enqueues preserve every point', async h => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        h.queue.enqueue(h.point(index))),
    );
    assert.ok(results.every(Boolean));
    assert.equal(h.points().length, 40);
    assert.equal(h.calls.length, 0);
  });

  await test('Acknowledgement preserves points added during upload', async h => {
    const gate = deferred();
    h.send(() => gate.promise);
    const first = h.point(1);
    await h.queue.enqueue(first);
    h.queue.resume();
    await settle();
    assert.equal(h.calls.length, 1);
    await h.queue.enqueue(h.point(2));
    gate.resolve({ acceptedIds: [first.id] });
    await settle();
    assert.equal(h.points().length, 1);
    assert.equal(h.points()[0].id, h.point(2).id);
  });

  await test('Lost acknowledgement retries the same identifier', async h => {
    let attempts = 0;
    h.send(async (owner, points) => {
      attempts++;
      if (attempts === 1) throw new Error('Synthetic lost response');
      return { acceptedIds: points.map(point => point.id) };
    });
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    assert.equal(h.points().length, 1);
    await h.advance(5000);
    assert.equal(h.points().length, 0);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].points[0].id, h.calls[1].points[0].id);
  });

  await test('Hung upload times out and permits a later retry', async h => {
    let attempts = 0;
    h.send(async (owner, points) => {
      attempts++;
      if (attempts === 1) return new Promise(() => {});
      return { acceptedIds: points.map(point => point.id) };
    });
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    await h.advance(15000);
    assert.equal(h.calls[0].signal.aborted, true);
    assert.equal(h.points().length, 1);
    await h.advance(5000);
    assert.equal(h.calls.length, 2);
    assert.equal(h.points().length, 0);
  });

  await test('Five failed attempts stop automatic retry', async h => {
    h.send(async () => { throw new Error('Synthetic rejection'); });
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    await h.advance(5000 + 10000 + 20000 + 40000);
    assert.equal(h.calls.length, 5);
    assert.ok(h.events.some(item => item.event === 'needs-attention'));
    await h.advance(600000);
    assert.equal(h.calls.length, 5);
    assert.equal(h.points().length, 1);
  });

  await test('Resume permits recovery after retry exhaustion', async h => {
    h.send(async () => { throw new Error('Synthetic rejection'); });
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    await h.advance(75000);
    assert.equal(h.calls.length, 5);
    h.send(async (owner, points) => ({
      acceptedIds: points.map(point => point.id),
    }));
    h.queue.resume();
    await settle();
    assert.equal(h.points().length, 0);
  });

  await test('Pausing cancels scheduled retries', async h => {
    h.send(async () => { throw new Error('Synthetic rejection'); });
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    h.queue.pause();
    await h.advance(60000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.points().length, 1);
  });

  await test('Partial acknowledgement does not remove queued points', async h => {
    h.send(async () => ({ acceptedIds: [] }));
    await h.queue.enqueue(h.point());
    h.queue.resume();
    await settle();
    assert.equal(h.points().length, 1);
    assert.ok(h.events.some(item => item.event === 'retrying'));
  });

  await test('Another account never receives the previous account queue', async h => {
    await h.queue.enqueue(h.point());
    const previous = h.owner();
    h.session({
      driverId: 'synthetic-driver-b',
      accessToken: 'synthetic-token-b',
      expiresAt: previous.expiresAt,
    });
    h.queue.sessionChanged();
    h.queue.resume();
    await settle();
    assert.equal(h.calls.length, 0);
    assert.equal(h.points('synthetic-driver-a').length, 1);
  });

  await test('Late acknowledgement after logout retains queued points', async h => {
    const gate = deferred();
    const point = h.point();
    h.send(() => gate.promise);
    await h.queue.enqueue(point);
    h.queue.resume();
    await settle();
    h.session(null);
    h.queue.sessionChanged();
    gate.resolve({ acceptedIds: [point.id] });
    await settle();
    await h.advance(0);
    assert.equal(h.points().length, 1);
  });

  await test('Disposal aborts upload and rejects late acknowledgement', async h => {
    const gate = deferred();
    const point = h.point();
    h.send(() => gate.promise);
    await h.queue.enqueue(point);
    h.queue.resume();
    await settle();
    h.queue.dispose();
    assert.equal(h.calls[0].signal.aborted, true);
    gate.resolve({ acceptedIds: [point.id] });
    await settle();
    assert.equal(h.points().length, 1);
  });

  await test('Corrupt queue is retained rather than overwritten', async h => {
    h.storage.set(h.key(), 'synthetic-invalid-json');
    assert.equal(await h.queue.enqueue(h.point()), false);
    assert.equal(h.storage.get(h.key()), 'synthetic-invalid-json');
    assert.ok(h.events.some(item => item.event === 'storage-error'));
  });

  await test('Full queue preserves old points and reports capacity', async h => {
    h.storage.set(h.key(), JSON.stringify({
      version: 1,
      driverId: 'synthetic-driver-a',
      points: Array.from({ length: 500 }, (_, index) => h.point(index)),
    }));
    const before = h.storage.get(h.key());
    assert.equal(await h.queue.enqueue(h.point(999)), false);
    assert.equal(h.storage.get(h.key()), before);
    assert.ok(h.events.some(item => item.event === 'queue-full'));
  });

  await test('Storage write failure is reported without delivery', async h => {
    h.failWrites(true);
    assert.equal(await h.queue.enqueue(h.point()), false);
    assert.equal(h.calls.length, 0);
    assert.ok(h.events.some(item => item.event === 'storage-error'));
  });

  await test('Conflicting local identifier does not overwrite its point', async h => {
    const point = h.point();
    await h.queue.enqueue(point);
    assert.equal(await h.queue.enqueue({
      ...point, longitude: 148,
    }), false);
    assert.equal(h.points()[0].longitude, point.longitude);
  });

  await test('Batches are limited to one hundred points', async h => {
    await Promise.all(
      Array.from({ length: 101 }, (_, index) =>
        h.queue.enqueue(h.point(index))),
    );
    h.queue.resume();
    await settle();
    assert.equal(h.calls[0].points.length, 100);
    await h.advance(0);
    assert.equal(h.calls[1].points.length, 1);
    assert.equal(h.points().length, 0);
  });


  await test('In-flight account switch preserves the old queue and sends only the new owner queue', async h => {
    const gate = deferred();
    let attempts = 0;
    h.send(async (owner, points) => {
      attempts++;
      if (attempts === 1) return gate.promise;
      return { acceptedIds: points.map(point => point.id) };
    });

    const first = h.point(1);
    await h.queue.enqueue(first);
    h.queue.resume();
    await settle();
    assert.equal(h.calls.length, 1);

    const previous = h.owner();
    h.session({
      driverId: 'synthetic-driver-b',
      accessToken: 'synthetic-token-b',
      expiresAt: previous.expiresAt,
    });
    h.queue.sessionChanged();
    assert.equal(h.calls[0].signal.aborted, true);

    await h.queue.enqueue(h.point(2));
    gate.resolve({ acceptedIds: [first.id] });
    await settle();
    await h.advance(0);

    assert.equal(h.points('synthetic-driver-a').length, 1);
    assert.equal(h.points('synthetic-driver-b').length, 0);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].owner.driverId, 'synthetic-driver-b');
    assert.equal(h.calls[1].points[0].id, h.point(2).id);
  });

  await test('Renewed token rejects stale acknowledgement and safely replays the same point', async h => {
    const gate = deferred();
    let attempts = 0;
    h.send(async (owner, points) => {
      attempts++;
      if (attempts === 1) return gate.promise;
      return { acceptedIds: points.map(point => point.id) };
    });

    const point = h.point();
    await h.queue.enqueue(point);
    h.queue.resume();
    await settle();

    const previous = h.owner();
    h.session({
      ...previous,
      accessToken: 'synthetic-renewed-token',
    });
    h.queue.sessionChanged();
    gate.resolve({ acceptedIds: [point.id] });
    await settle();

    assert.equal(h.points().length, 1);
    await h.advance(0);
    assert.equal(h.points().length, 0);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].points[0].id, point.id);
    assert.equal(h.calls[1].owner.accessToken, 'synthetic-renewed-token');
  });

  await test('Expired session prevents delivery and retains saved history', async h => {
    await h.queue.enqueue(h.point());
    const owner = h.owner();
    h.session({ ...owner, expiresAt: 0 });
    h.queue.resume();
    await settle();
    assert.equal(h.calls.length, 0);
    assert.equal(h.points().length, 1);
  });

  await test('Caller mutation cannot alter a point after enqueue begins', async h => {
    const point = h.point();
    const pending = h.queue.enqueue(point);
    point.longitude = 148;
    assert.equal(await pending, true);
    assert.equal(h.points()[0].longitude, 147.18);
  });

  console.log('Passed offline telemetry checks:', passed);
  console.log('Actual queue engine tested with simulated dependencies.');
  console.log('No network requests or device changes performed.');
}

main().catch(() => {
  console.log('STOP: Queue regression case:', current);
  console.log('Passed checks:', passed);
  console.log('Raw errors and synthetic argument values withheld.');
  process.exitCode = 1;
});
