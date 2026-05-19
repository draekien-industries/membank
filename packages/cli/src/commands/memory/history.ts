import {
  createMemoryRepository,
  createProjectRepository,
  type DatabaseManager,
} from "@membank/core";
import chalk from "chalk";
import Table from "cli-table3";
import type { Formatter } from "../../formatter.js";

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function memoryHistoryCommand(id: string, db: DatabaseManager, formatter: Formatter): void {
  const repo = createMemoryRepository(db, createProjectRepository(db));
  const versions = repo.listVersions(id);

  if (versions.length === 0) {
    formatter.error(`No version history found for memory: ${id}`);
    process.exit(1);
  }

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify(versions)}\n`);
    return;
  }

  const table = new Table({
    head: [chalk.bold("version"), chalk.bold("created_at"), chalk.bold("preview")],
    style: { head: [] },
  });

  for (const v of versions) {
    table.push([String(v.version), v.createdAt, truncate(v.content.replace(/\n/g, " "), 60)]);
  }

  process.stdout.write(`${table.toString()}\n`);
}
