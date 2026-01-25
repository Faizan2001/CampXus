#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, "src", "js");
const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "src/js/tests",
]);

const RULES = [
  {
    id: "no-then",
    description: "Avoid `.then(`; prefer async/await",
    pattern: /\.then\(/g,
  },
  {
    id: "no-dom-property-handlers",
    description:
      "Avoid DOM property handlers like `.onclick =`; use addEventListener",
    pattern:
      /\.on(click|change|input|keydown|keyup|keypress|submit)\s*=/g,
  },
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = full.slice(ROOT.length + 1).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || IGNORE_DIRS.has(rel)) continue;
      files.push(...(await listFiles(full)));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === ".js") {
      // Ignore tests explicitly (linting rules are for runtime code patterns)
      if (rel.includes("/src/js/tests/")) continue;
      files.push(full);
    }
  }

  return files;
}

function findLineCol(source, index) {
  const upto = source.slice(0, index);
  const lines = upto.split("\n");
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

function getLineText(source, lineNumber) {
  const lines = source.split("\n");
  return lines[lineNumber - 1] || "";
}

async function main() {
  const files = await listFiles(TARGET_DIR);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(source))) {
        const { line, col } = findLineCol(source, match.index);
        const rel = file.slice(ROOT.length + 1).replaceAll("\\", "/");
        violations.push({
          rule: rule.id,
          description: rule.description,
          file: rel,
          line,
          col,
          text: getLineText(source, line).trim(),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log("✅ lint: OK");
    return;
  }

  console.error(`❌ lint: ${violations.length} issue(s) found:\n`);
  for (const v of violations) {
    console.error(
      `- [${v.rule}] ${v.file}:${v.line}:${v.col} — ${v.description}\n  ${v.text}`
    );
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("❌ lint: failed to run", err);
  process.exitCode = 1;
});
