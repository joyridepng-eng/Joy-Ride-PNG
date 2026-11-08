
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const net = require("node:net");
const tls = require("node:tls");
const cp = require("node:child_process");

const root = path.dirname(require.resolve("../package.json"));
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "joyride-uuid-test-"));
const rootRequire = createRequire(path.join(root, "package.json"));
let current = "Checking patched UUID";
let passed = 0;

function check(name, action) {
  current = name;
  action();
  passed++;
  console.log("PASS:", name);
}

try {
  function blocked() { throw new Error("External activity blocked"); }
  net.connect = blocked;
  net.createConnection = blocked;
  net.Socket.prototype.connect = blocked;
  tls.connect = blocked;
  for (const name of [
    "spawn", "spawnSync", "exec", "execSync",
    "execFile", "execFileSync", "fork"
  ]) cp[name] = blocked;

  const uuid = rootRequire("uuid");
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const copies = Object.entries(lock.packages).filter(([key]) =>
    key === "node_modules/uuid" || key.endsWith("/node_modules/uuid")
  );

  check("All locked UUID copies use the reviewed patched version", () => {
    assert.ok(copies.length);
    assert.ok(copies.every(([, value]) => value.version === "11.1.1"));
  });

  check("CommonJS UUID v4 generates valid unique identifiers", () => {
    const ids = new Set();
    for (let index = 0; index < 1000; index++) {
      const id = uuid.v4();
      assert.ok(uuid.validate(id));
      assert.equal(uuid.version(id), 4);
      ids.add(id);
    }
    assert.equal(ids.size, 1000);
  });

  check("UUID v4 supports valid output buffers", () => {
    const buffer = new Uint8Array(24);
    assert.equal(uuid.v4({}, buffer, 4), buffer);
    assert.equal(uuid.version(uuid.stringify(buffer, 4)), 4);
  });

  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  for (const api of ["v3", "v5", "v6"]) {
    check(api + " rejects undersized buffers", () => {
      assert.throws(() => {
        if (api === "v6") uuid[api]({}, new Uint8Array(8), 4);
        else uuid[api]("synthetic", namespace, new Uint8Array(8), 4);
      }, RangeError);
    });
  }

  const xcodeManifest = rootRequire.resolve("xcode/package.json");
  const xcodeRequire = createRequire(xcodeManifest);
  const xcode = rootRequire("xcode");

  check("Xcode resolves patched UUID", () => {
    assert.equal(xcodeRequire.resolve("uuid"), rootRequire.resolve("uuid"));
  });

  const rootId = "0123456789ABCDEF01234567";
  const projectFile = path.join(testDirectory, "synthetic.pbxproj");
  fs.writeFileSync(projectFile, [
    "// !$*UTF8*$!",
    "{",
    "archiveVersion = 1;",
    "classes = {};",
    "objectVersion = 46;",
    "objects = {",
    "/* Begin PBXProject section */",
    rootId + " /* Project object */ = {",
    "isa = PBXProject;",
    'compatibilityVersion = "Xcode 3.2";',
    "targets = ();",
    "};",
    "/* End PBXProject section */",
    "};",
    "rootObject = " + rootId + " /* Project object */;",
    "}"
  ].join("\n") + "\n");

  function rootReference(project) {
    const value = project.hash.project.rootObject;
    return typeof value === "string" ? value : value.value;
  }

  let project;
  check("Xcode parses a synthetic project", () => {
    project = xcode.project(projectFile);
    project.parseSync();
    assert.equal(rootReference(project), rootId);
  });

  check("Xcode generates unique project identifiers", () => {
    const ids = new Set();
    for (let index = 0; index < 1000; index++) {
      const id = project.generateUuid();
      assert.match(id, /^[0-9A-F]{24}$/);
      assert.notEqual(id, rootId);
      ids.add(id);
    }
    assert.equal(ids.size, 1000);
  });

  check("Xcode project serialization round trip succeeds", () => {
    const file = path.join(testDirectory, "roundtrip.pbxproj");
    fs.writeFileSync(file, project.writeSync());
    const restored = xcode.project(file);
    restored.parseSync();
    assert.equal(rootReference(restored), rootId);
  });

  if (lock.packages["node_modules/@expo/ngrok"]) {
    check("Ngrok loads and resolves callable patched UUID without external activity", () => {
      const parentRequire = createRequire(
        rootRequire.resolve("@expo/ngrok/package.json"));
      assert.equal(parentRequire.resolve("uuid"), rootRequire.resolve("uuid"));
      assert.equal(typeof rootRequire("@expo/ngrok").connect, "function");
      assert.ok(uuid.validate(parentRequire("uuid").v4()));
    });
  }

  console.log("Passed UUID compatibility checks:", passed);
  console.log("No tunnel, subprocess, or production connection started.");
} catch {
  console.log("STOP: UUID regression case: " + current);
  console.log("Raw errors withheld.");
  process.exitCode = 1;
} finally {
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
