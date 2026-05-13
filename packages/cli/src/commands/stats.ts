import { createMemoryRepository, createProjectRepository, DatabaseManager } from "@membank/core";
import type { Formatter } from "../formatter.js";

export async function statsCommand(formatter: Formatter): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const repo = createMemoryRepository(db, createProjectRepository(db));
    const stats = repo.stats();
    formatter.outputStats(stats);
  } finally {
    db.close();
  }
}
