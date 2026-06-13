import type { MemoryType } from "@membank/core";
import { createSynthesisRepository, DatabaseManager, GLOBAL_PROJECT_NAME } from "@membank/core";
import { diffLines } from "@membank/core/client";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";
import { resolveScope } from "./resolve-scope.js";

export function synthesizeDiffCommand(
  v1: number,
  v2: number,
  opts: { scope?: string; memoryType: MemoryType },
  formatter: Formatter
): void {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
    const resolvedScope = resolveScope(scope, db);
    const repo = createSynthesisRepository(db);

    const version1 = repo.getVersion(resolvedScope, opts.memoryType, v1);
    if (version1 === undefined) {
      formatter.error(`Version ${v1} not found for scope: ${scope} (type: ${opts.memoryType})`);
      process.exit(1);
    }

    const version2 = repo.getVersion(resolvedScope, opts.memoryType, v2);
    if (version2 === undefined) {
      formatter.error(`Version ${v2} not found for scope: ${scope} (type: ${opts.memoryType})`);
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
