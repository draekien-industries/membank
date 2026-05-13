import { createMemoryRepository, type DatabaseManager, ProjectRepository } from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../formatter.js";
import type { PromptHelper } from "../prompt-helper.js";

export async function deleteCommand(
  id: string,
  db: DatabaseManager,
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  const row = db.db
    .prepare<[string], { id: string }>(`SELECT id FROM memories WHERE id = ?`)
    .get(id);

  if (row === undefined) {
    formatter.error(`Memory not found: ${id}`);
    process.exit(1);
  }

  const confirmed = await prompt.confirm(`Delete memory ${id}?`);
  if (!confirmed) {
    return;
  }

  const repo = createMemoryRepository(db, new ProjectRepository(db));
  repo.delete(id);

  process.stdout.write(`${chalk.green("✓")} Deleted memory: ${chalk.dim(id)}\n`);
}
