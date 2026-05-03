import type { MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService,
  MemoryRepository,
  ProjectRepository,
} from "@membank/core";
import type { Formatter } from "../formatter.js";

interface ListCommandOptions {
  type?: string;
  pinned?: boolean;
}

export async function listCommand(
  options: ListCommandOptions,
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const repo = new MemoryRepository(db, embedding, new ProjectRepository(db));

    const memories = repo.list({
      type: options.type as MemoryType | undefined,
      pinned: options.pinned,
    });

    formatter.outputMemories(memories);
  } finally {
    db.close();
  }
}
