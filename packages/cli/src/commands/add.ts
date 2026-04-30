import type { EmbeddingService, MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService as EmbeddingServiceImpl,
  MemoryRepository,
} from "@membank/core";
import ora from "ora";
import type { Formatter } from "../formatter.js";

interface AddCommandOptions {
  type: string;
  tags?: string;
  scope?: string;
}

export async function addCommand(
  content: string,
  options: AddCommandOptions,
  formatter: Formatter,
  db?: DatabaseManager,
  embeddingService?: EmbeddingService
): Promise<void> {
  const ownDb = db === undefined;
  const resolvedDb = db ?? DatabaseManager.open();
  try {
    const embedding = embeddingService ?? new EmbeddingServiceImpl();
    const repo = new MemoryRepository(resolvedDb, embedding);

    const tags = options.tags !== undefined ? options.tags.split(",").map((t) => t.trim()) : [];

    const spinner = formatter.isJson ? null : ora("Saving memory…").start();
    const memory = await repo.save({
      content,
      type: options.type as MemoryType,
      tags,
      scope: options.scope,
    });
    spinner?.succeed("Memory saved");

    formatter.outputMemory(memory);
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
