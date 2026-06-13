import type { SynthesisVersion } from "@membank/core";
import {
  createSynthesisRepository,
  DatabaseManager,
  GLOBAL_PROJECT_NAME,
  MEMORY_TYPE_VALUES,
} from "@membank/core";
import { diffLines } from "@membank/core/client";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";
import { resolveScope } from "./resolve-scope.js";

function findVersion(
  repo: ReturnType<typeof createSynthesisRepository>,
  scope: string,
  version: number
): SynthesisVersion | undefined {
  for (const type of MEMORY_TYPE_VALUES) {
    const found = repo.getVersion(scope, type, version);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function synthesizeDiffCommand(
  v1: number,
  v2: number,
  opts: { scope?: string },
  formatter: Formatter
): void {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
    const resolvedScope = resolveScope(scope, db);
    const repo = createSynthesisRepository(db);

    const version1 = findVersion(repo, resolvedScope, v1);
    if (version1 === undefined) {
      formatter.error(`Version ${v1} not found for scope: ${scope}`);
      process.exit(1);
    }

    const version2 = findVersion(repo, resolvedScope, v2);
    if (version2 === undefined) {
      formatter.error(`Version ${v2} not found for scope: ${scope}`);
      process.exit(1);
    }

    const diff = diffLines(version1.content, version2.content);

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(diff)}\n`);
      return;
    }

    process.stdout.write(`--- version ${v1}\n+++ version ${v2}\n`);
    for (const entry of diff) {
      if (entry.kind === "added") {
        process.stdout.write(chalk.green(`+ ${entry.line}\n`));
      } else if (entry.kind === "removed") {
        process.stdout.write(chalk.red(`- ${entry.line}\n`));
      } else {
        process.stdout.write(`  ${entry.line}\n`);
      }
    }
  } finally {
    db.close();
  }
}
