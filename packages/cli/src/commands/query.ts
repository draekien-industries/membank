import type { MemoryType } from "@membank/core";
import { DatabaseManager, EmbeddingService, MemoryRepository, QueryEngine } from "@membank/core";
import ora from "ora";
import type { Formatter } from "../formatter.js";

interface QueryCommandOptions {
  type?: string;
  limit?: string;
}

export async function queryCommand(
  queryText: string,
  options: QueryCommandOptions,
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const repo = new MemoryRepository(db, embedding);
    const engine = new QueryEngine(db, embedding, repo);

    const limit = options.limit !== undefined ? Number.parseInt(options.limit, 10) : 10;

    const spinner = formatter.isJson ? null : ora("Searching memories…").start();
    const results = await engine.query({
      query: queryText,
      type: options.type as MemoryType | undefined,
      limit,
    });
    spinner?.succeed(`${results.length} result${results.length === 1 ? "" : "s"} found`);

    formatter.outputQueryResults(results);
  } finally {
    db.close();
  }
}
