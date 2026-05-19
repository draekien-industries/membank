import {
  createMemoryRepository,
  createProjectRepository,
  type DatabaseManager,
} from "@membank/core";
import { diffLines } from "@membank/core/client";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";

export function memoryDiffCommand(
  id: string,
  v1: number,
  v2: number,
  db: DatabaseManager,
  formatter: Formatter
): void {
  const repo = createMemoryRepository(db, createProjectRepository(db));

  const version1 = repo.getVersion(id, v1);
  if (version1 === undefined) {
    formatter.error(`Version ${v1} not found for memory: ${id}`);
    process.exit(1);
  }

  const version2 = repo.getVersion(id, v2);
  if (version2 === undefined) {
    formatter.error(`Version ${v2} not found for memory: ${id}`);
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
}
