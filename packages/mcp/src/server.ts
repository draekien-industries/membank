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
  SynthesisTools,
} from "@membank/core";
import {
  createActivityLogger,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  deleteMemory,
  EmbeddingService,
  GLOBAL_SCOPE_HASH,
  isSynthesisEnabled,
  MEMORY_TYPE_VALUES,
  MemoryTypeSchema,
  MIGRATIONS,
  PIN_BUDGET_THRESHOLD,
  QueryEngine,
  resolveProject,
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
  DeleteMemoryArgsSchema,
  GetMemorySummaryArgsSchema,
  ListFlaggedMemoriesArgsSchema,
  PinMemoryArgsSchema,
  QueryMemoryArgsSchema,
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
      maxTokensPerRun: parsed.synthesis?.maxTokensPerRun,
      debounceMs: parsed.synthesis?.debounceMs,
      stalenessDays: parsed.synthesis?.stalenessDays,
      inFlightTimeoutMs: parsed.synthesis?.inFlightTimeoutMs,
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
  const query = new QueryEngine(db, embedding, repo, activityLogger);

  const synthConfig = loadSynthesisConfig();
  let synthEngine: SynthesisEngine | undefined;

  if (synthConfig.enabled) {
    const synthRepo = createSynthesisRepository(db);
    const agentRunner = createSynthesisAgentRunner(buildSynthesisTools(repo, query), synthConfig);
    synthEngine = new SynthesisEngine(synthRepo, synthConfig, agentRunner);
  }

  return { db, embedding, repo, query, projects, activityLogger, synthEngine };
}

async function scopeToProjectHash(
  scope: "current" | "global" | "all" | undefined
): Promise<string | undefined> {
  if (scope === "global") return GLOBAL_SCOPE_HASH;
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
          const scope =
            memory.projects.length > 0
              ? (memory.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH)
              : "global";
          core.synthEngine.markDirty(scope);
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
          const scope =
            memory.projects.length > 0
              ? (memory.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH)
              : "global";
          core.synthEngine.markDirty(scope);
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
          core.synthEngine !== undefined
            ? (memory.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH)
            : undefined;

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
        return { content: [{ type: "text", text: JSON.stringify(core.repo.stats(projectHash)) }] };
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
          projectHash,
          limit: args.limit,
          minSimilarity: args.minSimilarity,
          maxSimilarity: args.maxSimilarity,
        });
        return { content: [{ type: "text", text: JSON.stringify(memories) }] };
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

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}
