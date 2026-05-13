import { serve } from "@hono/node-server";
import {
  createMemoryRepository,
  DatabaseManager,
  EmbeddingService,
  ProjectRepository,
} from "@membank/core";
import { createApiApp } from "./index.js";

const PORT = 3847;

const db = DatabaseManager.open();
const embedding = new EmbeddingService();
const projects = new ProjectRepository(db);
const repo = createMemoryRepository(db, projects);

const app = createApiApp(db, repo, projects, embedding);

serve({ fetch: app.fetch, port: PORT });
process.stdout.write(`  API server → http://localhost:${PORT}\n`);

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

await new Promise<never>(() => {});
