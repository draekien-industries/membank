import type { MemoryType } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService,
  listMemoryTypes,
  MemoryRepository,
  QueryEngine,
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
