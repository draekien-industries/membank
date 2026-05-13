import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryRepository } from "@membank/core";
import {
  createMemoryRepository,
  DatabaseManager,
  EmbeddingService,
  isSynthesisEnabled,
  listMemoryTypes,
  MEMORY_TYPE_VALUES,
  MIGRATIONS,
  PIN_BUDGET_THRESHOLD,
  ProjectRepository,
  QueryEngine,
  resolveProject,
  runScopeToProjectsMigration,
  SynthesisRepository,
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
  MigrateArgsSchema,
  PinMemoryArgsSchema,
  QueryMemoryArgsSchema,
  ResolveReviewArgsSchema,
  SaveMemoryArgsSchema,
  UpdateMemoryArgsSchema,
} from "./schemas.js";
import type { SynthesisConfig, SynthesisTools } from "./synthesis/index.js";
import { SynthesisAgentLoop, SynthesisEngine } from "./synthesis/index.js";

const SERVER_NAME = "membank";
const SERVER_VERSION = "0.1.0";

export interface CoreServices {
  db: DatabaseManager;
  embedding: EmbeddingService;
  repo: MemoryRepository;
  query: QueryEngine;
  projects: ProjectRepository;
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

export function buildSynthesisTools(repo: MemoryRepository, query: QueryEngine): SynthesisTools {
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
    getMemorySummary: async () => JSON.stringify(repo.stats()),
  };
}

export function initCore(options: ServerOptions = {}): CoreServices {
  const db = options.useInMemoryDb
    ? DatabaseManager.openInMemory()
    : DatabaseManager.open(options.dbPath);
  const embedding = new EmbeddingService();
  const projects = new ProjectRepository(db);
  const repo = createMemoryRepository(db, projects);
  const query = new QueryEngine(db, embedding, repo);

  const synthConfig = loadSynthesisConfig();
  let synthEngine: SynthesisEngine | undefined;

  if (synthConfig.enabled) {
    const synthRepo = new SynthesisRepository(db);
    const agentLoop = new SynthesisAgentLoop(buildSynthesisTools(repo, query), synthConfig);
    synthEngine = new SynthesisEngine(db, synthRepo, synthConfig, agentLoop);
  }

  return { db, embedding, repo, query, projects, synthEngine };
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
        name: "list_memory_types",
        description: "Returns the ordered list of memory type values supported by membank.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
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
            global: {
              type: "boolean",
              description: "Save as a global memory, not tied to any project",
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
          "Search memories by semantic similarity. Returns results ranked by confidence score.",
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
            global: {
              type: "boolean",
              description:
                "Query global memories only. When omitted or false, queries the current project scope.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "migrate",
        description:
          'List or run named data migrations. Use mode "list" to see available migrations; mode "run" with a migration name to execute one.',
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["list", "run"],
              description: 'Mode: "list" to see available migrations, "run" to execute one',
            },
            name: {
              type: "string",
              description: 'Migration name (required when mode is "run")',
            },
          },
          required: ["mode"],
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
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "list_flagged_memories",
        description:
          "List memories that have unresolved dedup review events. These were flagged automatically when a near-duplicate was saved (cosine similarity 0.75–0.92).",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "resolve_review",
        description:
          "Dismiss all unresolved review events for a memory. Use after reviewing the memory and deciding it should be kept as-is.",
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
    if (request.params.name === "list_memory_types") {
      try {
        return {
          content: [{ type: "text", text: JSON.stringify(listMemoryTypes()) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "save_memory") {
      const args = parseArgs(SaveMemoryArgsSchema, request.params.arguments);
      const projectScope = args.global === true ? undefined : await resolveProject();

      try {
        const memory = await saveMemory(
          { content: args.content, type: args.type, tags: args.tags, projectScope },
          { repo: core.repo, embedder: core.embedding }
        );

        if (core.synthEngine !== undefined) {
          const scope =
            memory.projects.length > 0 ? (memory.projects[0]?.scopeHash ?? "global") : "global";
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
          { repo: core.repo, embedder: core.embedding }
        );

        if (core.synthEngine !== undefined) {
          const scope =
            memory.projects.length > 0 ? (memory.projects[0]?.scopeHash ?? "global") : "global";
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
        const exists =
          core.db.db
            .prepare<[string], { id: string }>(`SELECT id FROM memories WHERE id = ?`)
            .get(args.id) !== undefined;

        if (!exists) {
          return {
            content: [{ type: "text", text: `Memory not found: ${args.id}` }],
            isError: true,
          };
        }

        let memoryScopeBeforeDelete: string | undefined;
        if (core.synthEngine !== undefined) {
          const projectRow = core.db.db
            .prepare<[string], { scope_hash: string }>(
              `SELECT p.scope_hash FROM projects p
               JOIN memory_projects mp ON mp.project_id = p.id
               WHERE mp.memory_id = ?`
            )
            .get(args.id);
          memoryScopeBeforeDelete = projectRow?.scope_hash ?? "global";
        }

        core.repo.delete(args.id);

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
      const projectHash = args.global === true ? undefined : (await resolveProject()).hash;

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

    if (request.params.name === "migrate") {
      const args = parseArgs(MigrateArgsSchema, request.params.arguments);

      if (args.mode === "list") {
        return {
          content: [{ type: "text", text: JSON.stringify(MIGRATIONS) }],
        };
      }

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
          const charCount = core.repo.getPinnedCharCount();
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
      try {
        return { content: [{ type: "text", text: JSON.stringify(core.repo.stats()) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "list_flagged_memories") {
      try {
        const memories = core.repo.listFlagged();
        return { content: [{ type: "text", text: JSON.stringify(memories) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "resolve_review") {
      const args = parseArgs(ResolveReviewArgsSchema, request.params.arguments);

      try {
        const exists =
          core.db.db
            .prepare<[string], { id: string }>(`SELECT id FROM memories WHERE id = ?`)
            .get(args.id) !== undefined;

        if (!exists) {
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
