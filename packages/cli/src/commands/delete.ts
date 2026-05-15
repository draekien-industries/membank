import {
  createActivityLogger,
  createMemoryRepository,
  createProjectRepository,
  type DatabaseManager,
  deleteMemory,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../formatter.js";
import type { PromptHelper } from "../prompt-helper.js";

export async function deleteCommand(
  id: string,
  db: DatabaseManager,
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  const repo = createMemoryRepository(db, createProjectRepository(db));

  if (repo.findById(id) === undefined) {
    formatter.error(`Memory not found: ${id}`);
    process.exit(1);
  }

  const confirmed = await prompt.confirm(`Delete memory ${id}?`);
  if (!confirmed) {
    return;
  }

  const activityLogger = createActivityLogger(db);
  await deleteMemory(id, repo, activityLogger);

  process.stdout.write(`${chalk.green("✓")} Deleted memory: ${chalk.dim(id)}\n`);
}
