import { serve } from "@hono/node-server";
import {
  createActivityLogger,
  createActivityRepository,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisRepository,
  DatabaseManager,
  EmbeddingService,
} from "@membank/core";
import { createApiApp } from "./index.js";

const PORT = 3847;

const db = DatabaseManager.open();
const embedding = new EmbeddingService();
const projects = createProjectRepository(db);
const repo = createMemoryRepository(db, projects);
const activityLogger = createActivityLogger(db);
const activityRepo = createActivityRepository(db);
const synthRepo = createSynthesisRepository(db);

const app = createApiApp(repo, projects, embedding, synthRepo, activityRepo, activityLogger);

serve({ fetch: app.fetch, port: PORT });
process.stdout.write(`  API server → http://localhost:${PORT}\n`);

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

await new Promise<never>(() => {});
