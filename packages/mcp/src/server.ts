import type { MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService,
  listMemoryTypes,
  MemoryRepository,
  QueryEngine,
  resolveScope,
} from "@membank/core";
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types";

const SERVER_NAME = "membank";
const SERVER_VERSION = "0.1.0";

export interface CoreServices {
  db: DatabaseManager;
  embedding: EmbeddingService;
  repo: MemoryRepository;
  query: QueryEngine;
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
  const repo = new MemoryRepository(db, embedding);
  const query = new QueryEngine(db, embedding, repo);
  return { db, embedding, repo, query };
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
          "Save a new memory. Handles deduplication automatically — near-identical memories (cosine similarity >0.92, same type and scope) overwrite the existing record.",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Memory content to save" },
            type: {
              type: "string",
              enum: ["correction", "preference", "decision", "learning", "fact"],
              description: "Memory type",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags",
            },
            scope: { type: "string", description: "Scope (defaults to resolved project scope)" },
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
              enum: ["correction", "preference", "decision", "learning", "fact"],
              description: "Filter by memory type",
            },
            scope: { type: "string", description: "Filter by scope" },
            limit: { type: "number", description: "Maximum results to return (default 10)" },
          },
          required: ["query"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "list_memory_types") {
      return {
        content: [{ type: "text", text: JSON.stringify(listMemoryTypes()) }],
      };
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

      if (
        typeof type !== "string" ||
        !["correction", "preference", "decision", "learning", "fact"].includes(type)
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "type is required and must be one of: correction, preference, decision, learning, fact"
        );
      }

      const tags = Array.isArray(args?.tags) ? (args.tags as string[]) : undefined;
      const scope = typeof args?.scope === "string" ? args.scope : await resolveScope();

      const memory = await core.repo.save({
        content,
        type: type as MemoryType,
        tags,
        scope,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(memory) }],
      };
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
    }

    if (request.params.name === "query_memory") {
      const args = request.params.arguments as Record<string, unknown> | undefined;
      const queryText = args?.["query"];

      if (typeof queryText !== "string" || queryText.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "query is required and must be a non-empty string"
        );
      }

      const type = args?.["type"] as MemoryType | undefined;
      const scope = args?.["scope"] as string | undefined;
      const limit = typeof args?.["limit"] === "number" ? args["limit"] : 10;

      const results = await core.query.query({ query: queryText, type, scope, limit });

      const serialised = results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        tags: r.tags,
        scope: r.scope,
        pinned: r.pinned,
        score: r.score,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(serialised) }],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}
