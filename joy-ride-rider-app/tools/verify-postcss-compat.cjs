const path = require("node:path");
const cp = require("node:child_process");
const root = path.dirname(require.resolve("../package.json"));
const result = cp.spawnSync(process.execPath, ["-e", "\n    const assert = require(\"node:assert/strict\");\n    const { createRequire } = require(\"node:module\");\n    (async () => {\n      const consumer = createRequire(require.resolve(\"@expo/metro-config\"));\n      assert.equal(consumer(\"postcss/package.json\").version, \"8.5.23\");\n      const postcss = consumer(\"postcss\");\n      assert.equal(typeof postcss, \"function\");\n      assert.equal(postcss.parse(\"a{color:red}\").first.selector, \"a\");\n      const plugin = {\n        postcssPlugin: \"joyride-compatibility-fixture\",\n        Declaration(declaration) {\n          if (declaration.prop === \"color\") declaration.value = \"blue\";\n        }\n      };\n      const transformed = await postcss([plugin]).process(\n        \"a{color:red}\", {from: undefined}\n      );\n      assert.equal(transformed.css, \"a{color:blue}\");\n      const mapped = await postcss([]).process(\"a{color:red}\", {\n        from: \"joyride-fixture.css\",\n        to: \"joyride-output.css\",\n        map: {inline: false, annotation: false}\n      });\n      assert.equal(mapped.map.toJSON().version, 3);\n      assert.equal(mapped.map.toJSON().sources.length, 1);\n    })().catch(() => { process.exitCode = 1; });\n  "], {
  cwd: root, encoding: "utf8", windowsHide: true,
  timeout: 15000, maxBuffer: 1024 * 1024
});
if (result.error || result.status !== 0) {
  console.error("STOP: PostCSS compatibility checks failed; details withheld.");
  process.exitCode = 1;
} else {
  console.log("PASS: Expo PostCSS version, parser, plugin, and source-map checks.");
}
