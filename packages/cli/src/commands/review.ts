import {
  DatabaseManager,
  EmbeddingService,
  MemoryRepository,
  ProjectRepository,
} from "@membank/core";
import type { Formatter } from "../formatter.js";

export async function reviewCommand(
  opts: { resolve?: string },
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const repo = new MemoryRepository(db, embedding, new ProjectRepository(db));

    if (opts.resolve !== undefined) {
      repo.resolveReviewEvents(opts.resolve);
      if (!formatter.isJson) {
        process.stdout.write(`Resolved review events for memory ${opts.resolve}\n`);
      } else {
        process.stdout.write(`${JSON.stringify({ resolved: opts.resolve })}\n`);
      }
      return;
    }

    const flagged = repo.listFlagged();
    formatter.outputReview(flagged);
  } finally {
    db.close();
  }
}
