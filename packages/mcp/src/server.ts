import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ActivityLogger,
  Embedder,
  ExtractionTools,
  MemoryRepository,
  ProjectRepository,
  Querier,
  SynthesisConfig,
  SynthesisRepository,
  SynthesisTools,
} from "@membank/core";
import {
  clusterFlagged,
  createActivityLogger,
  createMemoryRepository,
  createProjectRepository,
  createQueryEngine,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  deleteManyMemories,
  deleteMemory,
  EmbeddingService,
  GLOBAL_PROJECT_NAME,
  GLOBAL_SCOPE_HASH,
  isSynthesisEnabled,
  MEMORY_TYPE_VALUES,
  MemoryTypeSchema,
  MIGRATIONS,
  mergeMemories,
  mergeProjects,
  PIN_BUDGET_THRESHOLD,
  reconcileWorktreeOrphan,
  resolveProject,
  resolveReviewMany,
  runScopeToProjectsMigration,
  SynthesisEngine,
  saveMemory,
  updateMemory,
} from "@membank/core";
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import {
  DeleteManyArgsSchema,
  DeleteMemoryArgsSchema,
  GetMemorySummaryArgsSchema,
  ListFlaggedMemoriesArgsSchema,
  ListMemoryHistoryArgsSchema,
  ListSynthesisHistoryArgsSchema,
  MergeMemoriesArgsSchema,
  PinMemoryArgsSchema,
  QueryMemoryArgsSchema,
  ReconcileProjectArgsSchema,
  ResolveManyArgsSchema,
  ResolveReviewArgsSchema,
  RunMigrationArgsSchema,
  SaveMemoryArgsSchema,
  UpdateMemoryArgsSchema,
} from "./schemas.js";

const SERVER_NAME = "membank";
const SERVER_VERSION = "0.1.0";

export interface CoreServices {
  db: DatabaseManager;
  embedding: Embedder;
  repo: MemoryRepository;
  query: Querier;
  projects: ProjectRepository;
  activityLogger: ActivityLogger;
  synthRepo: SynthesisRepository;
  synthEngine?: SynthesisEngine;
}

export interface ServerOptions {
  dbPath?: string;
  useInMemoryDb?: boolean;
}

function loadSynthesisConfig(): SynthesisConfig {
  const configPath = join(homedir(), ".membank", "config.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      synthesis?: Partial<SynthesisConfig>;
    };
    return {
      enabled: parsed.synthesis?.enabled === true,
      ...(parsed.synthesis?.maxTokensPerRun !== undefined && {
        maxTokensPerRun: parsed.synthesis.maxTokensPerRun,
      }),
      ...(parsed.synthesis?.debounceMs !== undefined && {
        debounceMs: parsed.synthesis.debounceMs,
      }),
      ...(parsed.synthesis?.stalenessDays !== undefined && {
        stalenessDays: parsed.synthesis.stalenessDays,
      }),
      ...(parsed.synthesis?.inFlightTimeoutMs !== undefined && {
        inFlightTimeoutMs: parsed.synthesis.inFlightTimeoutMs,
      }),
    };
  } catch {
    return { enabled: false };
  }
}

export function buildExtractionTools(
  repo: MemoryRepository,
  query: Querier,
  embedder: Embedder
): ExtractionTools {
  return {
    queryMemory: async (args) => {
      const projectHash =
        args.global === true
          ? GLOBAL_SCOPE_HASH
          : (args.projectHash ?? (await resolveProject()).hash);
      const results = await query.query({
        query: args.query,
        projectHash,
        limit: args.limit ?? 10,
        includePinned: true,
      });
      return JSON.stringify(results);
    },
    saveMemory: async (args) => {
      const projectScope = args.global === true ? undefined : await resolveProject();
      const memory = await saveMemory(
        {
          content: args.content,
          type: MemoryTypeSchema.parse(args.type),
          tags: args.tags,
          projectScope,
          sourceHarness: "membank-extraction",
        },
        { repo, embedder }
      );
      return JSON.stringify(memory);
    },
    updateMemory: async (args) => {
      const memory = await updateMemory(
        args.id,
        {
          content: args.content,
          type: args.type === undefined ? undefined : MemoryTypeSchema.parse(args.type),
          tags: args.tags,
        },
        { repo, embedder }
      );
      return JSON.stringify(memory);
    },
  };
}

export function buildSynthesisTools(repo: MemoryRepository, query: Querier): SynthesisTools {
  return {
    queryMemory: async (args) => {
      const projectHash =
        args.global === true ? undefined : (args.projectHash ?? (await resolveProject()).hash);
      const results = await query.query({
        query: args.query,
        projectHash,
        limit: args.limit ?? 20,
        includePinned: true,
      });
      return JSON.stringify(results);
    },
    getMemorySummary: async () => {
      const project = await resolveProject();
      return JSON.stringify(repo.stats(project.hash));
    },
  };
}

export function initCore(options: ServerOptions = {}): CoreServices {
  const db = options.useInMemoryDb
    ? DatabaseManager.openInMemory()
    : DatabaseManager.open(options.dbPath);
  const embedding = new EmbeddingService();
  const projects = createProjectRepository(db);
  const repo = createMemoryRepository(db, projects);
  const activityLogger = createActivityLogger(db);
  const query = createQueryEngine(db, embedding, activityLogger);

  const synthRepo = createSynthesisRepository(db);
  const synthConfig = loadSynthesisConfig();
  let synthEngine: SynthesisEngine | undefined;

  if (synthConfig.enabled) {
    const agentRunner = createSynthesisAgentRunner(buildSynthesisTools(repo, query), synthConfig);
    synthEngine = new SynthesisEngine(synthRepo, synthConfig, agentRunner);
  }

  return {
    db,
    embedding,
    repo,
    query,
    projects,
    activityLogger,
    synthRepo,
    ...(synthEngine !== undefined && { synthEngine }),
  };
}

async function scopeToProjectHash(
  scope: "current" | "global" | "all" | undefined
): Promise<string | undefined> {
  if (scope === GLOBAL_PROJECT_NAME) return GLOBAL_SCOPE_HASH;
  if (scope === "all") return undefined;
  return (await resolveProject()).hash;
}

function parseArgs<T>(schema: { parse: (v: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    const msg = e instanceof ZodError ? (e.issues[0]?.message ?? e.message) : String(e);
    throw new McpError(ErrorCode.InvalidParams, msg);
  }
}

export function createServer(core: CoreServices): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "save_memory",
        description:
          "Save a new memory. Handles deduplication automatically — near-identical memories (cosine similarity >0.92, same type and project) overwrite the existing record.",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Memory content to save" },
            type: {
              type: "string",
              enum: [...MEMORY_TYPE_VALUES],
              description: "Memory type",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags",
            },
            scope: {
              type: "string",
              enum: ["current", "global"],
              description:
                '"current" (default) = scoped to this project; "global" = saved as a global memory',
            },
          },
          required: ["content", "type"],
        },
      },
      {
        name: "update_memory",
        description:
          "Update the content, type, and/or tags of an existing memory by id. All fields except id are optional.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to update" },
            content: { type: "string", description: "New content for the memory" },
            type: {
              type: "string",
              enum: [...MEMORY_TYPE_VALUES],
              description: "New type for the memory (reclassification)",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Replacement tags (optional)",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_memory",
        description: "Delete a memory by id.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to delete" },
          },
          required: ["id"],
        },
      },
      {
        name: "query_memory",
        description:
          'Search memories by semantic similarity. Returns results ranked by confidence score. scope="current" (default) searches this project and global memories; scope="global" returns global memories only; scope="all" returns across every project.',
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search text" },
            type: {
              type: "string",
              enum: [...MEMORY_TYPE_VALUES],
              description: "Filter by memory type",
            },
            limit: { type: "number", description: "Maximum results to return (default 10)" },
            includePinned: {
              type: "boolean",
              description:
                "Include pinned memories in results. Pinned memories are already injected into session context, so excluded by default to avoid duplicates.",
            },
            scope: {
              type: "string",
              enum: ["current", "global", "all"],
              description:
                '"current" (default) = project + global; "global" = global memories only; "all" = all projects',
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_migrations",
        description: "List available named data migrations. Use run_migration to execute one.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "run_migration",
        description:
          "Execute a named data migration. Use list_migrations first to see available migration names.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Migration name to execute" },
          },
          required: ["name"],
        },
      },
      {
        name: "pin_memory",
        description:
          "Pin a memory by id. Pinned memories are always injected into the session context.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to pin" },
          },
          required: ["id"],
        },
      },
      {
        name: "unpin_memory",
        description: "Unpin a memory by id. Removes the memory from guaranteed session injection.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to unpin" },
          },
          required: ["id"],
        },
      },
      {
        name: "get_memory_summary",
        description:
          "Returns aggregate stats for session orientation: total memories, counts by type, pinned count, and review queue size.",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["current", "global", "all"],
              description:
                '"current" (default) = this project; "global" = global memories only; "all" = all projects',
            },
          },
          required: [],
        },
      },
      {
        name: "list_flagged_memories",
        description:
          "List memories that have unresolved dedup review events. These were flagged automatically when a near-duplicate was saved (cosine similarity 0.75–0.92).",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["current", "global", "all"],
              description:
                '"current" (default) = this project; "global" = global memories only; "all" = all projects',
            },
            limit: {
              type: "number",
              description: "Maximum number of flagged memories to return (max 100)",
            },
            minSimilarity: {
              type: "number",
              description:
                "Only include memories whose review event similarity is at or above this threshold (0–1)",
            },
            maxSimilarity: {
              type: "number",
              description:
                "Only include memories whose review event similarity is at or below this threshold (0–1)",
            },
          },
          required: [],
        },
      },
      {
        name: "resolve_review",
        description:
          "Mark all review events for this memory as resolved. Use after reviewing the flagged memory and deciding it is intentionally distinct from its near-duplicates and should be kept.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to resolve review events for" },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_many",
        description:
          "Delete multiple memories in a single call. Best-effort: each id is processed independently. Returns per-id status so you can see which deletions succeeded or failed.",
        inputSchema: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "string" },
              description: "Memory ids to delete (max 100)",
            },
          },
          required: ["ids"],
        },
      },
      {
        name: "resolve_many",
        description:
          "Resolve review events for multiple memories in a single call. Best-effort: each id is processed independently. Returns per-id status.",
        inputSchema: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "string" },
              description: "Memory ids to resolve review events for (max 100)",
            },
          },
          required: ["ids"],
        },
      },
      {
        name: "merge_memories",
        description:
          "Merge two or more memories into one. Writes merged_content to the kept memory, unions tags and projects from all dropped memories, then deletes the dropped memories. Re-runs dedup on the result. Use when flagged memories each carry unique information that should be combined.",
        inputSchema: {
          type: "object",
          properties: {
            keep_id: {
              type: "string",
              description: "Memory id to keep and update with merged content",
            },
            drop_ids: {
              type: "array",
              items: { type: "string" },
              description: "Memory ids to delete after merging their content in (max 20)",
            },
            merged_content: {
              type: "string",
              description: "The combined content to write to the kept memory",
            },
          },
          required: ["keep_id", "drop_ids", "merged_content"],
        },
      },
      {
        name: "list_memory_history",
        description:
          "List the version history of a memory. Returns up to 10 past content snapshots in descending version order. To revert, call update_memory with the content from the desired version.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Memory ID to retrieve version history for",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "list_synthesis_history",
        description:
          "List the version history of a synthesis. Returns up to 5 past synthesis snapshots in descending version order. To revert, use the CLI: membank synthesize revert <version>.",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              description:
                'Scope to retrieve history for. Use "global" for global scope or a 16-char hex scope hash.',
            },
          },
          required: ["scope"],
        },
      },
      {
        name: "list_projects",
        description:
          "List all projects with their origin, memory count, and scope hash. Use to find a project id for reconcile_project.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "reconcile_project",
        description:
          "Merge one project into another, moving its memories and activity. Omit both ids to auto-detect and reconcile the orphaned project for the current git worktree into its parent. Provide both ids for an explicit merge.",
        inputSchema: {
          type: "object",
          properties: {
            sourceId: {
              type: "string",
              description:
                "Project id to merge away. Omit to auto-detect the orphan for the current worktree.",
            },
            targetId: {
              type: "string",
              description:
                "Project id to merge into. Omit to auto-detect the parent for the current worktree.",
            },
          },
          required: [],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "save_memory") {
      const args = parseArgs(SaveMemoryArgsSchema, request.params.arguments);
      const projectScope = args.scope === "global" ? undefined : await resolveProject();

      try {
        const memory = await saveMemory(
          { content: args.content, type: args.type, tags: args.tags, projectScope },
          { repo: core.repo, embedder: core.embedding, activityLogger: core.activityLogger }
        );

        if (core.synthEngine !== undefined) {
          core.synthEngine.markDirty(memory.primaryScopeHash);
        }

        return {
          content: [{ type: "text", text: JSON.stringify(memory) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "update_memory") {
      const args = parseArgs(UpdateMemoryArgsSchema, request.params.arguments);

      try {
        const memory = await updateMemory(
          args.id,
          { content: args.content, type: args.type, tags: args.tags },
          { repo: core.repo, embedder: core.embedding, activityLogger: core.activityLogger }
        );

        if (core.synthEngine !== undefined) {
          core.synthEngine.markDirty(memory.primaryScopeHash);
        }

        return { content: [{ type: "text", text: JSON.stringify(memory) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "delete_memory") {
      const args = parseArgs(DeleteMemoryArgsSchema, request.params.arguments);

      try {
        const memory = core.repo.findById(args.id);

        if (memory === undefined) {
          return {
            content: [{ type: "text", text: `Memory not found: ${args.id}` }],
            isError: true,
          };
        }

        const memoryScopeBeforeDelete =
          core.synthEngine !== undefined ? memory.primaryScopeHash : undefined;

        await deleteMemory(args.id, core.repo, core.activityLogger);

        if (core.synthEngine !== undefined && memoryScopeBeforeDelete !== undefined) {
          core.synthEngine.markDirty(memoryScopeBeforeDelete);
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, id: args.id }) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "query_memory") {
      const args = parseArgs(QueryMemoryArgsSchema, request.params.arguments);
      const projectHash = await scopeToProjectHash(args.scope);

      try {
        const results = await core.query.query({
          query: args.query,
          type: args.type,
          projectHash,
          limit: args.limit ?? 10,
          includePinned: args.includePinned,
        });

        const serialised = results.map((r) => ({
          id: r.id,
          content: r.content,
          type: r.type,
          tags: r.tags,
          projects: r.projects,
          pinned: r.pinned,
          reviewEvents: r.reviewEvents,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          sourceHarness: r.sourceHarness,
          score: r.score,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(serialised) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "list_migrations") {
      return {
        content: [{ type: "text", text: JSON.stringify(MIGRATIONS) }],
      };
    }

    if (request.params.name === "run_migration") {
      const args = parseArgs(RunMigrationArgsSchema, request.params.arguments);

      if (args.name === "scope-to-projects") {
        try {
          const result = await runScopeToProjectsMigration(core.projects);
          if (result === null) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "No project found for current directory." }),
                },
              ],
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: message }], isError: true };
        }
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown migration: "${args.name}". Available: ${MIGRATIONS.map((m) => m.name).join(", ")}`
      );
    }

    if (request.params.name === "pin_memory" || request.params.name === "unpin_memory") {
      const args = parseArgs(PinMemoryArgsSchema, request.params.arguments);
      const pinned = request.params.name === "pin_memory";

      try {
        const memory = core.repo.setPin(args.id, pinned);

        if (pinned) {
          const { hash } = await resolveProject();
          const charCount = core.repo.getPinnedCharCount(hash);
          if (charCount > PIN_BUDGET_THRESHOLD && !isSynthesisEnabled()) {
            const result = {
              ...memory,
              pinBudgetWarning: `Pinned memories now use ${charCount} characters (threshold: ${PIN_BUDGET_THRESHOLD}). Consider unpinning older memories or enabling synthesis to compress them.`,
            };
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(memory) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "get_memory_summary") {
      const args = parseArgs(GetMemorySummaryArgsSchema, request.params.arguments);
      try {
        const projectHash = await scopeToProjectHash(args.scope);
        const base = core.repo.stats(projectHash);
        const queueBase = core.repo.reviewQueueStats(projectHash);
        const edges = core.repo.listReviewEdges(projectHash);
        const clusters = clusterFlagged(edges);
        const result = {
          ...base,
          reviewQueue: { ...queueBase, clusters: clusters.length },
        };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "list_flagged_memories") {
      const args = parseArgs(ListFlaggedMemoriesArgsSchema, request.params.arguments);
      try {
        const projectHash = await scopeToProjectHash(args.scope);
        const memories = core.repo.listFlagged({
          ...(projectHash !== undefined && { projectHash }),
          ...(args.limit !== undefined && { limit: args.limit }),
          ...(args.minSimilarity !== undefined && { minSimilarity: args.minSimilarity }),
          ...(args.maxSimilarity !== undefined && { maxSimilarity: args.maxSimilarity }),
        });

        const conflictingIds = memories.flatMap((m) =>
          m.reviewEvents.map((e) => e.conflictingMemoryId).filter((id): id is string => id !== null)
        );
        const uniqueIds = [...new Set(conflictingIds)];
        const conflictingMemories = core.repo.findManyById(uniqueIds);
        const conflictingMap = new Map(conflictingMemories.map((m) => [m.id, m]));

        const edges = core.repo.listReviewEdges(projectHash);
        const allClusters = clusterFlagged(edges);
        const memoryIdToCluster = new Map<string, string>();
        for (const cluster of allClusters) {
          for (const memId of cluster.memoryIds) {
            memoryIdToCluster.set(memId, cluster.clusterId);
          }
        }

        const flaggedIds = new Set(memories.map((m) => m.id));
        const relevantClusters = allClusters.filter((c) =>
          c.memoryIds.some((id) => flaggedIds.has(id))
        );

        const result = {
          memories: memories.map((m) => ({
            ...m,
            clusterId: memoryIdToCluster.get(m.id) ?? null,
            reviewEvents: m.reviewEvents.map((e) => ({
              ...e,
              conflictingMemory:
                e.conflictingMemoryId !== null
                  ? (conflictingMap.get(e.conflictingMemoryId) ?? null)
                  : null,
            })),
          })),
          clusters: relevantClusters,
        };

        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "resolve_review") {
      const args = parseArgs(ResolveReviewArgsSchema, request.params.arguments);

      try {
        if (core.repo.findById(args.id) === undefined) {
          return {
            content: [{ type: "text", text: `Memory not found: ${args.id}` }],
            isError: true,
          };
        }

        core.repo.resolveReviewEvents(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, id: args.id }) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "delete_many") {
      const args = parseArgs(DeleteManyArgsSchema, request.params.arguments);
      try {
        const scopes =
          core.synthEngine !== undefined
            ? [
                ...new Set(
                  args.ids
                    .map((id) => core.repo.findById(id))
                    .filter((m) => m !== undefined)
                    .map((m) => m.primaryScopeHash)
                ),
              ]
            : [];
        const results = await deleteManyMemories(args.ids, core.repo, core.activityLogger);
        if (core.synthEngine !== undefined) {
          for (const scope of scopes) core.synthEngine.markDirty(scope);
        }
        return { content: [{ type: "text", text: JSON.stringify(results) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "resolve_many") {
      const args = parseArgs(ResolveManyArgsSchema, request.params.arguments);
      try {
        const results = resolveReviewMany(args.ids, core.repo);
        return { content: [{ type: "text", text: JSON.stringify(results) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "merge_memories") {
      const args = parseArgs(MergeMemoriesArgsSchema, request.params.arguments);
      try {
        const result = await mergeMemories(
          { keepId: args.keep_id, dropIds: args.drop_ids, mergedContent: args.merged_content },
          { repo: core.repo, embedder: core.embedding, activityLogger: core.activityLogger }
        );
        if (core.synthEngine !== undefined) {
          core.synthEngine.markDirty(result.kept.primaryScopeHash);
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "list_memory_history") {
      const args = parseArgs(ListMemoryHistoryArgsSchema, request.params.arguments);
      const versions = core.repo.listVersions(args.id);
      return { content: [{ type: "text", text: JSON.stringify(versions) }] };
    }

    if (request.params.name === "list_synthesis_history") {
      const args = parseArgs(ListSynthesisHistoryArgsSchema, request.params.arguments);
      const scope = args.scope === GLOBAL_PROJECT_NAME ? GLOBAL_SCOPE_HASH : args.scope;
      const versions = core.synthRepo.listVersions(scope);
      return { content: [{ type: "text", text: JSON.stringify(versions) }] };
    }

    if (request.params.name === "list_projects") {
      const projects = core.projects.list().map((project) => ({
        ...project,
        memoryCount: core.projects.countMemories(project.id),
      }));
      return { content: [{ type: "text", text: JSON.stringify(projects) }] };
    }

    if (request.params.name === "reconcile_project") {
      const args = parseArgs(ReconcileProjectArgsSchema, request.params.arguments);

      if ((args.sourceId === undefined) !== (args.targetId === undefined)) {
        return {
          content: [
            {
              type: "text",
              text: "Provide both sourceId and targetId, or neither to auto-detect.",
            },
          ],
          isError: true,
        };
      }

      try {
        const result =
          args.sourceId !== undefined && args.targetId !== undefined
            ? mergeProjects(args.sourceId, args.targetId, core.projects)
            : await reconcileWorktreeOrphan(core.projects);

        if (result === null) {
          return {
            content: [
              {
                type: "text",
                text: "No orphaned project found for the current worktree.",
              },
            ],
          };
        }

        if (core.synthEngine !== undefined) {
          const target = core.projects.getById(result.target.id);
          if (target !== undefined) core.synthEngine.markDirty(target.scopeHash);
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}
