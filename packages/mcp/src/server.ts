import type { MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService,
  listMemoryTypes,
  MEMORY_TYPE_VALUES,
  MemoryRepository,
  ProjectRepository,
  QueryEngine,
  resolveProject,
} from "@membank/core";
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "membank";
const SERVER_VERSION = "0.1.0";

export interface CoreServices {
  db: DatabaseManager;
  embedding: EmbeddingService;
  repo: MemoryRepository;
  query: QueryEngine;
  projects: ProjectRepository;
}

export interface ServerOptions {
  dbPath?: string;
  useInMemoryDb?: boolean;
}

export function initCore(options: ServerOptions = {}): CoreServices {
  const db = options.useInMemoryDb
    ? DatabaseManager.openInMemory()
    : DatabaseManager.open(options.dbPath);
  const embedding = new EmbeddingService();
  const projects = new ProjectRepository(db);
  const repo = new MemoryRepository(db, embedding, projects);
  const query = new QueryEngine(db, embedding, repo);
  return { db, embedding, repo, query, projects };
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
        description: "Update the content and/or tags of an existing memory by id.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory id to update" },
            content: { type: "string", description: "New content for the memory" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Replacement tags (optional)",
            },
          },
          required: ["id", "content"],
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
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const content = args?.content;
      const type = args?.type;

      if (typeof content !== "string" || content.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "content is required and must be a non-empty string"
        );
      }

      if (typeof type !== "string" || !(MEMORY_TYPE_VALUES as readonly string[]).includes(type)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "type is required and must be one of: correction, preference, decision, learning, fact"
        );
      }

      const tags = Array.isArray(args?.tags) ? (args.tags as string[]) : undefined;

      let projectHash: string | undefined;
      let projectName: string | undefined;
      if (args?.global !== true) {
        const project = await resolveProject();
        projectHash = project.hash;
        projectName = project.name;
      }

      try {
        const memory = await core.repo.save({
          content,
          type: type as MemoryType,
          tags,
          projectHash,
          projectName,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(memory) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "update_memory") {
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const id = args?.id;
      const content = args?.content;

      if (typeof id !== "string" || id.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "id is required and must be a non-empty string"
        );
      }

      if (typeof content !== "string" || content.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "content is required and must be a non-empty string"
        );
      }

      const tags = Array.isArray(args?.tags) ? (args.tags as string[]) : undefined;

      try {
        const memory = await core.repo.update(id, { content, tags });
        return { content: [{ type: "text", text: JSON.stringify(memory) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "delete_memory") {
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const id = args?.id;

      if (typeof id !== "string" || id.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "id is required and must be a non-empty string"
        );
      }

      try {
        const exists =
          core.db.db
            .prepare<[string], { id: string }>(`SELECT id FROM memories WHERE id = ?`)
            .get(id) !== undefined;

        if (!exists) {
          return {
            content: [{ type: "text", text: `Memory not found: ${id}` }],
            isError: true,
          };
        }

        await core.repo.delete(id);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, id }) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    if (request.params.name === "query_memory") {
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const queryText = args?.query;

      if (typeof queryText !== "string" || queryText.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "query is required and must be a non-empty string"
        );
      }

      const type = args?.type as MemoryType | undefined;
      const limit = typeof args?.limit === "number" ? args.limit : 10;

      try {
        const results = await core.query.query({ query: queryText, type, limit });

        const serialised = results.map((r) => ({
          id: r.id,
          content: r.content,
          type: r.type,
          tags: r.tags,
          projects: r.projects,
          pinned: r.pinned,
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
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const mode = args?.mode;

      if (mode !== "list" && mode !== "run") {
        throw new McpError(ErrorCode.InvalidParams, 'mode must be "list" or "run"');
      }

      const migrations = [
        {
          name: "scope-to-projects",
          description:
            "Rename the auto-migrated project for the current directory from its generic hash-derived name to the resolved repo/directory name.",
        },
      ] as const;

      if (mode === "list") {
        return {
          content: [{ type: "text", text: JSON.stringify(migrations) }],
        };
      }

      const migrationName = args?.name;
      if (typeof migrationName !== "string" || migrationName.trim() === "") {
        throw new McpError(ErrorCode.InvalidParams, "name is required for run mode");
      }

      if (migrationName === "scope-to-projects") {
        try {
          const resolved = await resolveProject();
          const project = core.projects.getByHash(resolved.hash);
          if (project === undefined) {
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
          const oldName = project.name;
          const memoryCount = core.projects.countMemories(project.id);
          core.projects.rename(project.id, resolved.name);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  migration: "scope-to-projects",
                  oldName,
                  newName: resolved.name,
                  memoryCount,
                }),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: message }], isError: true };
        }
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown migration: "${migrationName}". Available: scope-to-projects`
      );
    }

    if (request.params.name === "pin_memory" || request.params.name === "unpin_memory") {
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const id = args?.id;

      if (typeof id !== "string" || id.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "id is required and must be a non-empty string"
        );
      }

      const pinned = request.params.name === "pin_memory";

      try {
        const memory = core.repo.setPin(id, pinned);
        return { content: [{ type: "text", text: JSON.stringify(memory) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}
