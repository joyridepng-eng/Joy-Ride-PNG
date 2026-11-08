const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { TextDecoder } = require("node:util");

try {
  const root = path.dirname(require.resolve("../package.json"));
  const tracked = cp.spawnSync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (tracked.error || tracked.status !== 0) throw new Error();

  const selected = new Set(tracked.stdout.split("\0").filter(Boolean));
  for (const file of [
    "tools/verify-source-hygiene.cjs",
    "tools/verify-uri-decoder.cjs",
    "tools/verify-postcss-compat.cjs",
    "tools/verify-image-size-compat.cjs",
  ]) {
    if (fs.existsSync(path.join(root, file))) selected.add(file);
  }

  function addVendor(directory) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error();
      if (item.isDirectory()) addVendor(file);
      else selected.add(path.relative(root, file).replace(/\\/g, "/"));
    }
  }
  addVendor(path.join(root, "vendor/decode-uri-component"));
  addVendor(path.join(root, "vendor/image-size-compat"));

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const issues = [];
  let checked = 0;

  for (const relative of selected) {
    const knownName = [
      ".gitignore",
      ".gitattributes",
      ".editorconfig",
      ".prettierrc",
    ].includes(path.basename(relative));
    if (
      !knownName &&
      !/\.(?:[cm]?[jt]sx?|json|ya?ml|prisma|sql|mdx?|txt|css|html|svg)$/i.test(
        relative,
      )
    ) {
      continue;
    }
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes(".."))
      throw new Error();

    const file = path.join(root, relative);
    if (!fs.lstatSync(file).isFile()) throw new Error();
    const bytes = fs.readFileSync(file);
    checked++;

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      issues.push({ file: relative, category: "UTF-8 BOM" });
      continue;
    }
    if (
      (bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff)
    ) {
      issues.push({ file: relative, category: "UTF-16 BOM" });
      continue;
    }

    let text;
    try {
      text = decoder.decode(bytes);
    } catch {
      issues.push({ file: relative, category: "Invalid UTF-8" });
      continue;
    }
    if (text.includes("\0")) {
      issues.push({ file: relative, category: "NUL bytes in text" });
    }
    if (
      /\.(?:[cm]?[jt]sx?|json|ya?ml|prisma|sql|css|html)$/i.test(relative) &&
      /^(?:<{7}(?:\s|$)|>{7}(?:\s|$)|={7}\r?$)/m.test(text)
    ) {
      issues.push({ file: relative, category: "Merge-conflict marker" });
    }
  }

  if (!checked) throw new Error();
  console.log("Text files checked:", checked);
  console.log("Source-hygiene findings:", issues.length);
  for (const issue of issues) {
    console.log("File:", issue.file);
    console.log("Category:", issue.category);
  }
  if (issues.length) {
    process.exitCode = 1;
  } else {
    console.log("PASS: Source encoding and conflict-marker checks.");
  }
} catch {
  console.error("STOP: Source-hygiene check incomplete; raw details withheld.");
  process.exitCode = 1;
}
