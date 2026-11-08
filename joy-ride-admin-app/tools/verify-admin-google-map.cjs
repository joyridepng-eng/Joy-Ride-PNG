const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ts = require(path.join(root, 'node_modules/typescript'));
function load(name, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal((result.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error).length, 0);
  const exported = {};
  vm.runInNewContext(result.outputText, { exports: exported, require: (key) => { assert(Object.hasOwn(imports, key)); return imports[key]; }, URL, URLSearchParams, AbortController, Event, ...globals });
  return exported;
}
async function loaderProbe(mode) {
  const key = ['AIza', 'X'.repeat(35)].join('');
  let fetched = 0;
  let scripted = 0;
  let scriptUrl;
  const handlers = new Map();
  const window = {
    location: { origin: mode === 'wrong-origin' ? 'https://example.invalid' : 'http://localhost:8081' },
    setTimeout: (callback) => setTimeout(callback, 100),
    clearTimeout,
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener: (name) => handlers.delete(name),
    dispatchEvent: (event) => { handlers.get(event.type)?.(); },
  };
  const types = { maps: { Map: class {}, Circle: class {} }, marker: { AdvancedMarkerElement: class {} }, core: { LatLngBounds: class {} } };
  const document = {
    createElement: () => ({ remove() {} }),
    head: { appendChild: (script) => {
      scripted += 1;
      scriptUrl = new URL(script.src);
      assert.equal(scriptUrl.origin, 'https://maps.googleapis.com');
      assert.equal(scriptUrl.pathname, '/maps/api/js');
      assert.equal(scriptUrl.searchParams.get('key'), key);
      assert.equal(scriptUrl.searchParams.get('auth_referrer_policy'), 'origin');
      assert.equal(script.referrerPolicy, 'strict-origin-when-cross-origin');
      queueMicrotask(() => {
        if (mode === 'network-error') { script.onerror(); return; }
        if (mode === 'auth-error') { window.gm_authFailure(); return; }
        window.google = { maps: { importLibrary: async (name) => types[name], event: { clearInstanceListeners() {} } } };
        window.joyrideSafetyMapsReady();
      });
    } },
  };
  const module = load('components/emergency-map/google.web.ts', {}, {
    window, document,
    fetch: async (url, init) => {
      fetched += 1;
      assert.equal(url, '/__joyride/maps-config');
      assert.equal(init.cache, 'no-store');
      return new Response(JSON.stringify({ safetyTest: true, key: mode === 'invalid-config' ? 'invalid' : key }), { status: 200 });
    },
  });
  if (mode === 'ok') {
    const first = module.loadGoogleMaps();
    assert.equal(module.loadGoogleMaps(), first);
    const library = await first;
    assert.equal(library.Map, types.maps.Map);
    assert.equal(library.AdvancedMarkerElement, types.marker.AdvancedMarkerElement);
    assert.equal(fetched, 1); assert.equal(scripted, 1);
  } else {
    await assert.rejects(module.loadGoogleMaps());
    if (mode === 'wrong-origin') { assert.equal(fetched, 0); assert.equal(scripted, 0); }
    if (mode === 'invalid-config') assert.equal(scripted, 0);
  }
}
async function main() {
  const native = load('services/emergency-map-core.ts');
  const nodes = [];
  const document = { createElement: () => {
    const node = { style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    Object.defineProperty(node, 'innerHTML', { set() { throw new Error('Unsafe HTML.'); } });
    nodes.push(node); return node;
  } };
  const map = load('components/emergency-map/web-map-core.ts', { '@/services/emergency-map-core': native }, { document });
  const now = Date.now();
  const incident = { latitude: 0, longitude: 0, recordedAt: new Date(now).toISOString(), source: 'MANUAL_PIN', accuracyMeters: null };
  assert.equal(map.mapPosition(incident).lat, 0);
  assert.equal(map.mapPosition(incident).lng, 0);
  assert.throws(() => map.mapPosition({ ...incident, latitude: NaN }));
  assert.throws(() => map.mapPosition({ ...incident, longitude: 181 }));
  const latest = { ...incident, latitude: -9.44, longitude: 147.18, source: 'FLEET_GPS', driverOnline: true };
  const before = JSON.stringify(incident);
  assert.equal(map.gpsIsUncertain(latest, false, now), false);
  assert.equal(map.gpsIsUncertain(latest, true, now), true);
  assert.equal(map.gpsIsUncertain({ ...latest, driverOnline: false }, false, now), true);
  assert.equal(map.gpsIsUncertain({ ...latest, recordedAt: new Date(now - 90000).toISOString() }, false, now), true);
  assert.equal(map.gpsIsUncertain({ ...latest, recordedAt: new Date(now + 90000).toISOString() }, false, now), true);
  map.mapPosition({ ...latest, latitude: -9.45 });
  assert.equal(JSON.stringify(incident), before);
  const title = '<img src=x onerror=alert(1)>';
  const car = map.carContent(title, '#c62828');
  assert.equal(car.title, title);
  assert.equal(car.attributes['aria-label'], title);
  assert.equal(car.textContent, '🚗');
  for (const mode of ['ok', 'wrong-origin', 'invalid-config', 'network-error', 'auth-error']) await loaderProbe(mode);
  const contact = fs.readFileSync(path.join(root, 'components/emergency-tracking.web.tsx'), 'utf8');
  assert(contact.includes('item.driver.phone'));
  assert(contact.includes('incidentVehicleLabel(item)'));
  assert(contact.includes('item.driver.vehicles.map'));
  assert(contact.includes('These do not confirm the vehicle at the incident.'));
  assert(contact.indexOf('item.driver.phone') < contact.indexOf('<EmergencyMap'));
  const component = fs.readFileSync(path.join(root, 'components/emergency-map/index.web.tsx'), 'utf8');
  assert(component.includes('Centre on saved incident'));
  assert(component.includes('Centre on latest Driver GPS'));
  assert(component.includes('marker.map = null'));
  assert(component.includes('mapId: "DEMO_MAP_ID"'));
  console.log('PASS: Google loader origin/config/error guards, single SDK load, safe DOM markers, immutable incident/uncertain GPS and contact-before-map contracts. No Google/network request made.');
}
main().catch(() => { console.log('STOP: Offline Google map contracts. Raw details withheld.'); process.exitCode = 1; });
