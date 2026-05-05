import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type { MemoryType, Project } from "@membank/core";
import {
  DatabaseManager,
  EmbeddingService,
  MemoryRepository,
  ProjectRepository,
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

interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string;
  source: string | null;
  access_count: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface ReviewEventRow {
  id: string;
  memory_id: string;
  conflicting_memory_id: string | null;
  similarity: number;
  conflict_content_snapshot: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
}

function parseReviewEvent(row: ReviewEventRow) {
  return {
    id: row.id,
    memoryId: row.memory_id,
    conflictingMemoryId: row.conflicting_memory_id,
    similarity: row.similarity,
    conflictContentSnapshot: row.conflict_content_snapshot,
    reason: row.reason,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function getReviewEventsForMemories(db: DatabaseManager, ids: string[]) {
  if (ids.length === 0) return new Map<string, ReturnType<typeof parseReviewEvent>[]>();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db.db
    .prepare<string[], ReviewEventRow>(
      `SELECT * FROM memory_review_events WHERE memory_id IN (${placeholders}) AND resolved_at IS NULL ORDER BY created_at DESC`
    )
    .all(...ids);
  const map = new Map<string, ReturnType<typeof parseReviewEvent>[]>();
  for (const row of rows) {
    const event = parseReviewEvent(row);
    const existing = map.get(event.memoryId) ?? [];
    existing.push(event);
    map.set(event.memoryId, existing);
  }
  return map;
}

function parseRow(
  row: MemoryRow,
  projects: Project[] = [],
  reviewEvents: ReturnType<typeof parseReviewEvent>[] = []
) {
  return {
    id: row.id,
    content: row.content,
    type: row.type,
    tags: JSON.parse(row.tags) as string[],
    projects,
    sourceHarness: row.source,
    accessCount: row.access_count,
    pinned: row.pinned !== 0,
    reviewEvents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  db: DatabaseManager,
  repo: MemoryRepository,
  projectRepo: ProjectRepository
): Hono {
  const app = new Hono();

  // List memories with optional filters
  app.get("/api/memories", (c) => {
    const { type, pinned, needsReview, search, projectId } = c.req.query();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (type) {
      conditions.push("m.type = ?");
      params.push(type);
    }
    if (pinned === "true") {
      conditions.push("m.pinned = 1");
    }
    if (needsReview === "true") {
      conditions.push(
        "EXISTS (SELECT 1 FROM memory_review_events e WHERE e.memory_id = m.id AND e.resolved_at IS NULL)"
      );
    }
    if (projectId === "global") {
      conditions.push("m.id NOT IN (SELECT memory_id FROM memory_projects)");
    } else if (projectId) {
      conditions.push("m.id IN (SELECT memory_id FROM memory_projects WHERE project_id = ?)");
      params.push(projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.db
      .prepare<(string | number)[], MemoryRow>(
        `SELECT m.* FROM memories m ${where} ORDER BY m.created_at DESC`
      )
      .all(...params);

    const ids = rows.map((r) => r.id);
    const projectMap = projectRepo.getProjectsForMemories(ids);
    const eventMap = getReviewEventsForMemories(db, ids);

    let memories = rows.map((r) =>
      parseRow(r, projectMap.get(r.id) ?? [], eventMap.get(r.id) ?? [])
    );

    if (search) {
      const q = search.toLowerCase();
      memories = memories.filter((m) => m.content.toLowerCase().includes(q));
    }

    return c.json(memories);
  });

  // Get single memory
  app.get("/api/memories/:id", (c) => {
    const id = c.req.param("id");
    const row = db.db.prepare<[string], MemoryRow>("SELECT * FROM memories WHERE id = ?").get(id);

    if (!row) return c.json({ error: "Not found" }, 404);

    const projectMap = projectRepo.getProjectsForMemories([id]);
    const eventMap = getReviewEventsForMemories(db, [id]);
    return c.json(parseRow(row, projectMap.get(id) ?? [], eventMap.get(id) ?? []));
  });

  // Update memory
  app.patch("/api/memories/:id", async (c) => {
    const id = c.req.param("id");

    const existing = db.db
      .prepare<[string], { id: string }>("SELECT id FROM memories WHERE id = ?")
      .get(id);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      content?: string;
      tags?: string[];
      type?: string;
      pinned?: boolean;
      needsReview?: boolean;
    }>();

    const sets: string[] = [];
    const sqlParams: (string | number)[] = [];

    if (body.pinned !== undefined) {
      sets.push("pinned = ?");
      sqlParams.push(body.pinned ? 1 : 0);
    }
    if (body.type !== undefined) {
      sets.push("type = ?");
      sqlParams.push(body.type);
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      sqlParams.push(new Date().toISOString(), id);
      db.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...sqlParams);
    }

    if (body.needsReview === false) {
      repo.resolveReviewEvents(id);
    }

    if (body.content !== undefined || body.tags !== undefined) {
      await repo.update(id, { content: body.content, tags: body.tags });
    }

    const updated = db.db
      .prepare<[string], MemoryRow>("SELECT * FROM memories WHERE id = ?")
      .get(id) as MemoryRow;

    const projectMap = projectRepo.getProjectsForMemories([id]);
    const eventMap = getReviewEventsForMemories(db, [id]);
    return c.json(parseRow(updated, projectMap.get(id) ?? [], eventMap.get(id) ?? []));
  });

  // Delete memory
  app.delete("/api/memories/:id", async (c) => {
    await repo.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  // Associate memory with project
  app.post("/api/memories/:id/projects", async (c) => {
    const memoryId = c.req.param("id");
    const body = await c.req.json<{ projectId: string }>();
    projectRepo.addAssociation(memoryId, body.projectId);
    return c.json({ ok: true });
  });

  // Remove project association from memory
  app.delete("/api/memories/:id/projects/:projectId", (c) => {
    projectRepo.removeAssociation(c.req.param("id"), c.req.param("projectId"));
    return c.json({ ok: true });
  });

  // List projects
  app.get("/api/projects", (c) => {
    return c.json(projectRepo.list());
  });

  // Rename project
  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ name: string }>();
    try {
      return c.json(projectRepo.rename(id, body.name));
    } catch {
      return c.json({ error: "Not found" }, 404);
    }
  });

  // Stats
  app.get("/api/stats", (c) => {
    const byType = {
      correction: 0,
      preference: 0,
      decision: 0,
      learning: 0,
      fact: 0,
    } as Record<MemoryType, number>;

    const typeRows = db.db
      .prepare<[], { type: string; count: number }>(
        "SELECT type, COUNT(*) as count FROM memories GROUP BY type"
      )
      .all();

    for (const row of typeRows) {
      if (row.type in byType) {
        byType[row.type as MemoryType] = row.count;
      }
    }

    const totals = db.db
      .prepare<[], { total: number }>("SELECT COUNT(*) as total FROM memories")
      .get() ?? { total: 0 };

    const reviewRow = db.db
      .prepare<[], { needsReview: number }>(
        "SELECT COUNT(DISTINCT memory_id) as needsReview FROM memory_review_events WHERE resolved_at IS NULL"
      )
      .get() ?? { needsReview: 0 };

    return c.json({ byType, total: totals.total, needsReview: reviewRow.needsReview });
  });

  return app;
}

export async function startDashboard(opts?: { port?: number }): Promise<void> {
  const port = await findFreePort(opts?.port ?? PREFERRED_PORT);

  const db = DatabaseManager.open();
  const embedding = new EmbeddingService();
  const projects = new ProjectRepository(db);
  const repo = new MemoryRepository(db, embedding, projects);

  const app = createApiApp(db, repo, projects);

  // Static file serving + SPA fallback
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
