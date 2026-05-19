import {
  createActivityLogger,
  createMemoryRepository,
  createProjectRepository,
  type DatabaseManager,
  EmbeddingService as EmbeddingServiceImpl,
  revertMemory,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";
import type { PromptHelper } from "../../prompt-helper.js";

export async function memoryRevertCommand(
  id: string,
  version: number,
  db: DatabaseManager,
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  const repo = createMemoryRepository(db, createProjectRepository(db));

  if (repo.findById(id) === undefined) {
    formatter.error(`Memory not found: ${id}`);
    process.exit(1);
  }

  if (repo.getVersion(id, version) === undefined) {
    formatter.error(`Version ${version} not found for memory: ${id}`);
    process.exit(1);
  }

  const confirmed = await prompt.confirm(`Revert memory ${id} to version ${version}?`);
  if (!confirmed) {
    return;
  }

  const embedder = new EmbeddingServiceImpl();
  const activityLogger = createActivityLogger(db);
  await revertMemory(id, version, { repo, embedder, activityLogger });

  process.stdout.write(
    `${chalk.green("✓")} Reverted memory ${chalk.dim(id)} to version ${version}\n`
  );
}
