import { randomUUID } from "node:crypto";
import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import type { MemoryTarget } from "../../capability/domain/memory-target.js";
import type { CapabilityRepository } from "../../capability/ports.js";
import { GLOBAL_PROJECT_NAME, GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { SaveFieldsSchema } from "../../schemas.js";
import { classifyDuplicate } from "../domain/dedup-policy.js";
import type { Memory } from "../domain/memory.js";
import type { CreateMemoryOpts, Embedder, MemoryRepository } from "../ports.js";

export type SaveOptions = {
  content: string;
  type: Memory["type"];
  tags?: string[];
  sourceHarness?: string;
  target: MemoryTarget;
};

export async function saveMemory(
  opts: SaveOptions,
  deps: {
    repo: MemoryRepository;
    embedder: Embedder;
    capabilities?: CapabilityRepository;
    activityLogger?: ActivityLogger;
  }
): Promise<Memory> {
  const { content, type, tags = [], sourceHarness } = SaveFieldsSchema.parse(opts);
  const { target } = opts;
  const { repo, embedder, activityLogger = noopActivityLogger } = deps;

  const projectScope = resolveProjectScope(target);
  const dedupScope = target.tag === "capability" ? undefined : projectScope?.hash;
  const logScope = projectScope?.hash ?? GLOBAL_SCOPE_HASH;

  const embedding = await embedder.embed(content);

  const [top] = repo.findSimilar(embedding, dedupScope);

  // capability memories are self-curated and unassociated from any project, so they bypass
  // the project/global-scoped dedup; the per-capability most-recent cap is their safety valve.
  if (top !== undefined && target.tag !== "capability") {
    const decision = classifyDuplicate(top.similarity);

    if (decision === "overwrite") {
      const updated = repo.overwrite(top.id, content, embedding);
      activityLogger.logEvent({
        projectHash: logScope,
        eventType: "memory.updated",
        memoryId: top.id,
      });
      return updated;
    }

    if (decision === "flag") {
      const newMemory = repo.create(
        buildCreateOpts({ content, type, tags, sourceHarness, embedding, projectScope })
      );
      repo.createReviewEvent({
        memoryId: top.id,
        conflictingMemoryId: newMemory.id,
        similarity: top.similarity,
        conflictContentSnapshot: content,
      });
      activityLogger.logEvent({
        projectHash: logScope,
        eventType: "memory.created",
        memoryId: newMemory.id,
        payload: { contentSnapshot: content.slice(0, 1000), memoryType: type },
      });
      activityLogger.logEvent({
        projectHash: logScope,
        eventType: "memory.flagged",
        memoryId: top.id,
        payload: {
          conflictingMemoryId: newMemory.id,
          similarity: top.similarity,
          conflictSnapshot: content.slice(0, 1000),
        },
      });
      return newMemory;
    }
  }

  const created = repo.create(
    buildCreateOpts({ content, type, tags, sourceHarness, embedding, projectScope })
  );

  if (target.tag === "capability") {
    if (deps.capabilities === undefined) {
      throw new Error("saveMemory: a CapabilityRepository is required for a capability target");
    }
    const capability = deps.capabilities.upsertByKey(target.key);
    deps.capabilities.associate(created.id, capability.id);
  }

  activityLogger.logEvent({
    projectHash: logScope,
    eventType: "memory.created",
    memoryId: created.id,
    payload: { contentSnapshot: content.slice(0, 1000), memoryType: type },
  });
  return created;
}

function resolveProjectScope(
  target: MemoryTarget
): { hash: string; name: string; origin?: string } | undefined {
  switch (target.tag) {
    case "project":
      return target.scope;
    case "global":
      return { hash: GLOBAL_SCOPE_HASH, name: GLOBAL_PROJECT_NAME };
    case "capability":
      return undefined;
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unhandled target: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function buildCreateOpts(args: {
  content: string;
  type: Memory["type"];
  tags: string[];
  sourceHarness: string | undefined;
  embedding: Float32Array;
  projectScope: { hash: string; name: string; origin?: string } | undefined;
}): CreateMemoryOpts {
  return {
    id: randomUUID(),
    content: args.content,
    type: args.type,
    tags: args.tags,
    sourceHarness: args.sourceHarness ?? null,
    embedding: args.embedding,
    ...(args.projectScope !== undefined && { projectScope: args.projectScope }),
  };
}
