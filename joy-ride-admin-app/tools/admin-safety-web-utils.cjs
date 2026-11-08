const fs = require('node:fs');
const { Buffer: NodeBuffer } = require('node:buffer');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const TEST_API = 'https://joyride-safety-test-api.onrender.com';
const PRODUCTION_API = 'explore-png-api.onrender.com';
const sha = (bytes) => nodeCrypto.createHash('sha256').update(bytes).digest('hex');
const normal = (bytes) => NodeBuffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function check(ok) { if (!ok) throw new Error('Guard failed.'); }
function webService(source) {
  const line = '        headers.set("Cache-Control", "no-store");';
  check(source.split(line).length === 2);
  const result = source.replace(line,
    '        headers.delete("Cache-Control");').replace(
    '          headers,\n          signal: controller.signal,',
    '          headers,\n          cache: "no-store",\n          signal: controller.signal,');
  check(result.includes('cache: "no-store",') && !result.includes('headers.set("Cache-Control"'));
  return result.replace(
    '// React Native\'s fetch polyfill adds an undeclared _ query parameter\n        // for cache: "no-store". Use a header so strict API queries stay intact.',
    '// Browser-only copy: use browser cache policy without an author-supplied\n        // Cache-Control header. Native requests remain unchanged.');
}
function apiSource() {
  return `// Isolated laptop Safety Test copy only.\nexport const API_BASE_URL = "${TEST_API}";\n`;
}
function configSource() {
  return `// Isolated web-only configuration. No Android Maps key is used.\nmodule.exports = {\n  name: "JoyRide Admin Safety Test",\n  slug: "joy-ride-admin-app",\n  scheme: "joyrideadminsafetytest",\n  version: "1.1.0",\n  platforms: ["web"],\n  plugins: ["expo-router"],\n  updates: { enabled: false },\n  web: { bundler: "metro", output: "single", name: "JoyRide Admin Safety Test" },\n  extra: { joyrideSafetyTest: true, joyrideTestApi: "${TEST_API}" },\n};\n`;
}
function blockedFile(name) {
  return /(^|\/)(\.env($|\.)|\.npmrc$|credentials\.json$|google-services\.json$|GoogleService-Info\.plist$)/i.test(name) || /\.(keystore|jks|p12|pfx|pem|key)$/i.test(name);
}
function listFiles(root, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    check(!entry.isSymbolicLink());
    if (entry.isDirectory()) result.push(...listFiles(root, relative));
    else { check(entry.isFile()); result.push(relative); }
  }
  return result.sort();
}
function distManifest(root) {
  const files = listFiles(root);
  check(files.includes('index.html') && files.length > 1);
  const entries = [];
  let testFound = false;
  for (const name of files) {
    check(!blockedFile(name) && !name.endsWith('.map'));
    const bytes = fs.readFileSync(path.join(root, name));
    if (/\.(js|html|json|css|txt)$/i.test(name)) {
      const text = bytes.toString('utf8');
      check(!text.includes(PRODUCTION_API));
      check(!/AIza[0-9A-Za-z_-]{35}/.test(text));
      if (text.includes(TEST_API)) testFound = true;
    }
    entries.push({ path: name, sha256: sha(bytes) });
  }
  check(testFound);
  return entries;
}
module.exports = { TEST_API, sha, normal, check, webService, apiSource, configSource, blockedFile, listFiles, distManifest };
