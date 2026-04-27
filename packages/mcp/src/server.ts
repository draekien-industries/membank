import { DatabaseManager, EmbeddingService, MemoryRepository, QueryEngine } from "@membank/core";
import { Server } from "@modelcontextprotocol/sdk/server";

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
  return new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: {} });
}
