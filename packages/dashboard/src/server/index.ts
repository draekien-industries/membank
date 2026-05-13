import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type { Embedder, MemoryRepository, MemoryType, ProjectRepository } from "@membank/core";
import {
  createMemoryRepository,
  createProjectRepository,
  DatabaseManager,
  EmbeddingService,
  updateMemory,
} from "@membank/core";
import { Hono } from "hono";
import open from "open";

const PREFERRED_PORT = 3847;

const MIME: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".json": "application/json",
};

function tryPort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(port, () => {
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function findFreePort(preferred: number): Promise<number> {
  try {
    return await tryPort(preferred);
  } catch {
    return await new Promise((resolve) => {
      const server = createServer();
      server.listen(0, () => {
        const addr = server.address();
        const port = addr !== null && typeof addr === "object" ? addr.port : 0;
        server.close(() => resolve(port));
      });
    });
  }
}

export function createApiApp(
  repo: MemoryRepository,
  projectRepo: ProjectRepository,
  embedder: Embedder
): Hono {
  const app = new Hono();

  app.get("/api/memories", (c) => {
    const { type, pinned, needsReview, search, projectId } = c.req.query();
    let memories = repo.list({
      type: type as MemoryType | undefined,
      pinned: pinned === "true" ? true : undefined,
      needsReview: needsReview === "true" ? true : undefined,
      projectId,
    });
    if (search) {
      const q = search.toLowerCase();
      memories = memories.filter((m) => m.content.toLowerCase().includes(q));
    }
    return c.json(memories);
  });

  app.get("/api/memories/:id", (c) => {
    const memory = repo.findById(c.req.param("id"));
    if (!memory) return c.json({ error: "Not found" }, 404);
    return c.json(memory);
  });

  app.patch("/api/memories/:id", async (c) => {
    const id = c.req.param("id");
    if (!repo.findById(id)) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      content?: string;
      tags?: string[];
      type?: string;
      pinned?: boolean;
      needsReview?: boolean;
    }>();

    if (body.pinned !== undefined) repo.setPin(id, body.pinned);
    if (body.needsReview === false) repo.resolveReviewEvents(id);
    if (body.content !== undefined || body.tags !== undefined || body.type !== undefined) {
      await updateMemory(
        id,
        { content: body.content, tags: body.tags, type: body.type as MemoryType | undefined },
        { repo, embedder }
      );
    }

    return c.json(repo.findById(id));
  });

  app.delete("/api/memories/:id", (c) => {
    repo.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/memories/:id/projects", async (c) => {
    const body = await c.req.json<{ projectId: string }>();
    projectRepo.addAssociation(c.req.param("id"), body.projectId);
    return c.json({ ok: true });
  });

  app.delete("/api/memories/:id/projects/:projectId", (c) => {
    projectRepo.removeAssociation(c.req.param("id"), c.req.param("projectId"));
    return c.json({ ok: true });
  });

  app.get("/api/projects", (c) => {
    return c.json(projectRepo.list());
  });

  app.patch("/api/projects/:id", async (c) => {
    const body = await c.req.json<{ name: string }>();
    try {
      return c.json(projectRepo.rename(c.req.param("id"), body.name));
    } catch {
      return c.json({ error: "Not found" }, 404);
    }
  });

  app.get("/api/stats", (c) => {
    const { byType, total, needsReview } = repo.stats();
    return c.json({ byType, total, needsReview });
  });

  return app;
}

export async function startDashboard(opts?: { port?: number }): Promise<void> {
  const port = await findFreePort(opts?.port ?? PREFERRED_PORT);

  const db = DatabaseManager.open();
  const embedding = new EmbeddingService();
  const projects = createProjectRepository(db);
  const repo = createMemoryRepository(db, projects);

  const app = createApiApp(repo, projects, embedding);

  const __dir = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(__dir, "client");

  app.get("*", (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = join(clientDir, reqPath);

    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      const mime = MIME[extname(filePath)] ?? "application/octet-stream";
      return new Response(content, { headers: { "content-type": mime } });
    }

    const html = readFileSync(join(clientDir, "index.html"));
    return new Response(html, { headers: { "content-type": "text/html" } });
  });

  process.on("SIGINT", () => {
    db.close();
    process.exit(0);
  });

  serve({ fetch: app.fetch, port });

  process.stdout.write(`\n  Membank dashboard  →  http://localhost:${port}\n`);
  process.stdout.write(`  Press Ctrl+C to stop\n\n`);

  await open(`http://localhost:${port}`);

  await new Promise<never>(() => {});
}
