import type { MemoryType } from "@membank/core";
import {
  createSynthesisRepository,
  DatabaseManager,
  GLOBAL_PROJECT_NAME,
  MEMORY_TYPE_VALUES,
} from "@membank/core";
import chalk from "chalk";
import Table from "cli-table3";
import type { Formatter } from "../../formatter.js";
import { resolveScope } from "./resolve-scope.js";

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function synthesizeHistoryCommand(
  opts: { scope?: string; memoryType?: MemoryType },
  formatter: Formatter
): void {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
    const resolvedScope = resolveScope(scope, db);
    const repo = createSynthesisRepository(db);
    const types = opts.memoryType !== undefined ? [opts.memoryType] : MEMORY_TYPE_VALUES;
    const versions = types.flatMap((type) => repo.listVersions(resolvedScope, type));

    if (versions.length === 0) {
      formatter.error(`No version history found for scope: ${scope}`);
      process.exit(1);
    }

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(versions)}\n`);
      return;
    }

    const table = new Table({
      head: [
        chalk.bold("type"),
        chalk.bold("version"),
        chalk.bold("synthesized_at"),
        chalk.bold("preview"),
      ],
      style: { head: [] },
    });

    for (const v of versions) {
      table.push([
        v.memoryType,
        String(v.version),
        new Date(v.synthesizedAt).toLocaleString(),
        truncate(v.content.replace(/\n/g, " "), 60),
      ]);
    }

    process.stdout.write(`${table.toString()}\n`);
  } finally {
    db.close();
  }
}
