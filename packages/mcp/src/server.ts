import {
  DatabaseManager,
  EmbeddingService,
  listMemoryTypes,
  MemoryRepository,
  QueryEngine,
} from "@membank/core";
import { Server } from "@modelcontextprotocol/sdk/server";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types";

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

export function createServer(_core: CoreServices): Server {
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === "list_memory_types") {
      return {
        content: [{ type: "text", text: JSON.stringify(listMemoryTypes()) }],
      };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}
