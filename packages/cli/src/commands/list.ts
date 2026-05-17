import { createMemoryRepository, createProjectRepository, DatabaseManager } from "@membank/core";
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
    const repo = createMemoryRepository(db, createProjectRepository(db));

    const memories = repo.list({
      ...(options.type !== undefined && { type: MemoryTypeSchema.parse(options.type) }),
      ...(options.pinned !== undefined && { pinned: options.pinned }),
    });

    formatter.outputMemories(memories);
  } finally {
    db.close();
  }
}
