import { DatabaseManager, EmbeddingService, MemoryRepository } from "@membank/core";
import type { Formatter } from "../formatter.js";

export async function statsCommand(formatter: Formatter): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const repo = new MemoryRepository(db, embedding);

    const stats = repo.stats();

    formatter.outputStats(stats);
  } finally {
    db.close();
  }
}
