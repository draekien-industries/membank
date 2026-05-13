import { createMemoryRepository, DatabaseManager, ProjectRepository } from "@membank/core";
import type { Formatter } from "../formatter.js";
import { MemoryTypeSchema } from "../schemas.js";

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
    const repo = createMemoryRepository(db, new ProjectRepository(db));

    const memories = repo.list({
      type: options.type !== undefined ? MemoryTypeSchema.parse(options.type) : undefined,
      pinned: options.pinned,
    });

    formatter.outputMemories(memories);
  } finally {
    db.close();
  }
}
