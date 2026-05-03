import {
  DatabaseManager,
  EmbeddingService,
  MemoryRepository,
  ProjectRepository,
} from "@membank/core";
import chalk from "chalk";

export function pinCommand(id: string, db?: DatabaseManager): void {
  const ownDb = db === undefined;
  const resolvedDb = db ?? DatabaseManager.open();
  try {
    const repo = new MemoryRepository(
      resolvedDb,
      new EmbeddingService(),
      new ProjectRepository(resolvedDb)
    );
    repo.setPin(id, true);
    process.stdout.write(`${chalk.green("✓")} Pinned: ${chalk.dim(id)}\n`);
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
