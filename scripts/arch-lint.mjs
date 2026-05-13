#!/usr/bin/env node
/**
 * Architecture lint: enforces the dependency direction inside core's layered contexts
 * and prevents presentation packages from reaching into core's infrastructure.
 *
 * Rules:
 *   1. core/src/<ctx>/domain/ files may not import from application/ or infrastructure/
 *   2. core/src/<ctx>/application/ files may not import from infrastructure/
 *   3. packages/{cli,mcp,dashboard} may not import from @membank/core paths containing /infrastructure/
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const CORE_SRC = join(ROOT, "packages", "core", "src");

function findFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full));
    } else if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !full.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

function getImports(content) {
  const pattern = /(?:from|import)\s+["']([^"']+)["']/g;
  return [...content.matchAll(pattern)].map((m) => m[1]);
}

const errors = [];

// Rule 1 & 2: Core internal layering
for (const file of findFiles(CORE_SRC)) {
  const rel = relative(CORE_SRC, file).replace(/\\/g, "/");
  const content = readFileSync(file, "utf-8");
  const imports = getImports(content);

  const isDomain = /\/domain\//.test(rel) || rel.startsWith("domain/");
  const isApplication = /\/application\//.test(rel) || rel.startsWith("application/");

  for (const imp of imports) {
    if (isDomain) {
      if (/\/application(\/|\.js)/.test(imp)) {
        errors.push(
          `core/src/${rel}: domain/ must not import from application/ (import: "${imp}")`
        );
      }
      if (/\/infrastructure(\/|\.js)/.test(imp)) {
        errors.push(
          `core/src/${rel}: domain/ must not import from infrastructure/ (import: "${imp}")`
        );
      }
    }
    if (isApplication) {
      if (/\/infrastructure(\/|\.js)/.test(imp)) {
        errors.push(
          `core/src/${rel}: application/ must not import from infrastructure/ (import: "${imp}")`
        );
      }
    }
  }
}

// Rule 3: Presentation packages must not reach into core's infrastructure
const PRESENTATION_SRCS = [
  join(ROOT, "packages", "cli", "src"),
  join(ROOT, "packages", "mcp", "src"),
  join(ROOT, "packages", "dashboard", "src"),
];

for (const srcDir of PRESENTATION_SRCS) {
  for (const file of findFiles(srcDir)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf-8");
    const imports = getImports(content);
    for (const imp of imports) {
      if (imp.includes("@membank/core") && /\/infrastructure(\/|\.js)/.test(imp)) {
        errors.push(
          `${rel}: presentation packages must not import from @membank/core's infrastructure/ (import: "${imp}")`
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Architecture lint violations:\n");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error(`\n${errors.length} violation(s) found.`);
  process.exit(1);
}

console.log("Architecture lint: OK");
