import type { EmbeddingService, MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService as EmbeddingServiceImpl,
  MemoryRepository,
  ProjectRepository,
  resolveProject,
} from "@membank/core";
import ora from "ora";
import type { Formatter } from "../formatter.js";

interface AddCommandOptions {
  type: string;
  tags?: string;
  global?: boolean;
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
    const projects = new ProjectRepository(resolvedDb);
    const repo = new MemoryRepository(resolvedDb, embedding, projects);

    const tags = options.tags !== undefined ? options.tags.split(",").map((t) => t.trim()) : [];

    const projectScope = options.global ? undefined : await resolveProject();

    const spinner = formatter.isJson ? null : ora("Saving memory…").start();
    const memory = await repo.save({
      content,
      type: options.type as MemoryType,
      tags,
      projectScope,
    });
    spinner?.succeed("Memory saved");

    formatter.outputMemory(memory);
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
