import type { EmbeddingService, MemoryTarget } from "@membank/core";
import {
  createActivityLogger,
  createMemoryRepository,
  createProjectRepository,
  DatabaseManager,
  EmbeddingService as EmbeddingServiceImpl,
  resolveProject,
  saveMemory,
} from "@membank/core";
import ora from "ora";
import type { Formatter } from "../formatter.js";
import { MemoryTypeSchema } from "../schemas.js";

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
    const embedder = embeddingService ?? new EmbeddingServiceImpl();
    const projects = createProjectRepository(resolvedDb);
    const repo = createMemoryRepository(resolvedDb, projects);
    const activityLogger = createActivityLogger(resolvedDb);

    const tags = options.tags !== undefined ? options.tags.split(",").map((t) => t.trim()) : [];

    const target: MemoryTarget = options.global
      ? { tag: "global" }
      : { tag: "project", scope: await resolveProject() };

    const spinner = formatter.isJson ? null : ora("Saving memory…").start();
    const memory = await saveMemory(
      {
        content,
        type: MemoryTypeSchema.parse(options.type),
        tags,
        target,
      },
      { repo, embedder, activityLogger }
    );
    spinner?.succeed("Memory saved");

    formatter.outputMemory(memory);
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
