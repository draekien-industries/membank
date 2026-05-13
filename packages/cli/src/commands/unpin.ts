import { createMemoryRepository, DatabaseManager, ProjectRepository } from "@membank/core";
import chalk from "chalk";

export function unpinCommand(id: string, db?: DatabaseManager): void {
  const ownDb = db === undefined;
  const resolvedDb = db ?? DatabaseManager.open();
  try {
    const repo = createMemoryRepository(resolvedDb, new ProjectRepository(resolvedDb));
    repo.setPin(id, false);
    process.stdout.write(`${chalk.green("✓")} Unpinned: ${chalk.dim(id)}\n`);
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
