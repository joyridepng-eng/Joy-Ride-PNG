const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tools = require('./admin-safety-web-utils.cjs');
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ts = require(path.join(root, 'node_modules/typescript'));
function load(source) {
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal((result.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error).length, 0);
  const exported = {};
  vm.runInNewContext(result.outputText, {
    exports: exported,
    require: (name) => {
      if (name === '@/services/admin-auth') return { adminFetch: async () => { throw new Error('Unexpected fetch.'); } };
      if (name === './emergency-map-core') return { latestLocationForDriver: () => { throw new Error('Unexpected GPS lookup.'); } };
      throw new Error('Unexpected import.');
    },
    Headers, URLSearchParams, AbortController, setTimeout, clearTimeout,
  });
  return exported;
}
async function main() {
  const native = fs.readFileSync(path.join(root, 'services/admin-safety.ts'), 'utf8');
  const browser = fs.readFileSync(path.join(root, 'services/admin-safety.web.ts'), 'utf8');
  assert.equal(browser, tools.webService(native));
  const webApi = load(browser);
  assert.deepEqual(Object.keys(webApi).sort(), Object.keys(load(native)).sort());
  let count = 0;
  const client = webApi.createAdminSafetyClient(async (url, init) => {
    assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).has('Cache-Control'), false);
    assert.equal(new Headers(init.headers).has('Pragma'), false);
    assert.equal(new URL(url, tools.TEST_API).searchParams.has('_'), false);
    assert.equal(init.signal instanceof AbortSignal, true);
    if (count === 0) assert.equal(url, '/emergencies/admin?limit=25&status=OPEN');
    if (count === 1) assert.equal(url, '/feedback/admin?limit=25&status=NEW');
    count += 1;
    return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
  });
  await client.emergencies('OPEN');
  await client.feedback('NEW');
  assert.equal(count, 2);
  let patchSeen = false;
  const patchClient = webApi.createAdminSafetyClient(async (url, init) => {
    assert.equal(url, '/emergencies/admin/alert-1/acknowledge');
    assert.equal(init.method, 'PATCH');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
    assert.equal(new Headers(init.headers).has('Cache-Control'), false);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.body, JSON.stringify({ note: 'TEST ONLY' }));
    patchSeen = true;
    return new Response('{}', { status: 400 });
  });
  await assert.rejects(patchClient.acknowledge('alert-1', ' TEST ONLY '));
  assert.equal(patchSeen, true);
  console.log('PASS: Browser GET/PATCH cache, CORS-header, query, body and export/config contracts. No network requests made.');
}
main().catch(() => { console.log('STOP: Offline browser contracts. Raw details withheld.'); process.exitCode = 1; });
