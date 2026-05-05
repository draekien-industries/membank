import {
  DatabaseManager,
  EmbeddingService,
  MemoryRepository,
  ProjectRepository,
  QueryEngine,
} from "@membank/core";
import ora from "ora";
import type { Formatter } from "../formatter.js";
import { LimitSchema, MemoryTypeSchema } from "../schemas.js";

interface QueryCommandOptions {
  type?: string;
  limit?: string;
  includePinned?: boolean;
}

export async function queryCommand(
  queryText: string,
  options: QueryCommandOptions,
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const repo = new MemoryRepository(db, embedding, new ProjectRepository(db));
    const engine = new QueryEngine(db, embedding, repo);

    const limit = options.limit !== undefined ? LimitSchema.parse(options.limit) : 10;

    const spinner = formatter.isJson ? null : ora("Searching memories…").start();
    const results = await engine.query({
      query: queryText,
      type: options.type !== undefined ? MemoryTypeSchema.parse(options.type) : undefined,
      limit,
      includePinned: options.includePinned,
    });
    spinner?.succeed(`${results.length} result${results.length === 1 ? "" : "s"} found`);

    formatter.outputQueryResults(results);
  } finally {
    db.close();
  }
}
