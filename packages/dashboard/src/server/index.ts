import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type {
  ActivityEventType,
  ActivityLogger,
  ActivityRepository,
  Embedder,
  Memory,
  MemoryRepository,
  MemoryType,
  ProjectRepository,
  Querier,
  SynthesisRepository,
  SynthesisTools,
} from "@membank/core";
import {
  ActivityEventTypeSchema,
  createActivityLogger,
  createActivityRepository,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  deleteMemory,
  EmbeddingService,
  isSynthesisEnabled,
  listEvents,
  QueryEngine,
  revertMemory,
  runSynthesis,
  updateMemory,
} from "@membank/core";
import { Hono } from "hono";
import open from "open";

const PREFERRED_PORT = 3847;

function buildSynthesisTools(repo: MemoryRepository, querier: Querier): SynthesisTools {
  return {
    queryMemory: async (args) => {
      const results = await querier.query({
        query: args.query,
        projectHash: args.global === true ? undefined : args.projectHash,
        limit: args.limit ?? 20,
        includePinned: true,
      });
      return JSON.stringify(results);
    },
    getMemorySummary: async () => JSON.stringify(repo.stats()),
  };
}

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

function aggregateActivity(memories: Memory[], days: number): { date: string; count: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dayCounts: Record<string, number> = {};
  for (const m of memories) {
    const day = m.createdAt.slice(0, 10);
    if (day >= cutoffStr) dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    const updateDay = m.updatedAt.slice(0, 10);
    if (updateDay !== day && updateDay >= cutoffStr)
      dayCounts[updateDay] = (dayCounts[updateDay] ?? 0) + 1;
  }

  return Object.entries(dayCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function createApiApp(
  repo: MemoryRepository,
  projectRepo: ProjectRepository,
  embedder: Embedder,
  queryEngine: QueryEngine,
  synthRepo: SynthesisRepository,
  activityRepo: ActivityRepository,
  activityLogger: ActivityLogger
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
        { repo, embedder, activityLogger }
      );
    }

    return c.json(repo.findById(id));
  });

  app.delete("/api/memories/:id", async (c) => {
    await deleteMemory(c.req.param("id"), repo, activityLogger);
    return c.json({ ok: true });
  });

  app.get("/api/memories/:id/history", (c) => {
    return c.json(repo.listVersions(c.req.param("id")));
  });

  app.post("/api/memories/:id/revert", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ version: number }>();
    try {
      const updated = await revertMemory(id, body.version, { repo, embedder, activityLogger });
      return c.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 404);
    }
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

  app.get("/api/syntheses", (c) => {
    return c.json(synthRepo.listAll());
  });

  app.get("/api/projects/:id/synthesis", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    return c.json(synthRepo.getSynthesis(project.scopeHash) ?? null);
  });

  app.post("/api/projects/:id/synthesis", (c) => {
    if (!isSynthesisEnabled()) return c.json({ error: "Synthesis is disabled" }, 503);
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    const agentRunner = createSynthesisAgentRunner(buildSynthesisTools(repo, queryEngine), {
      enabled: true,
    });
    void runSynthesis(project.scopeHash, { synthRepo, agentRunner });
    return c.json({ ok: true }, 202);
  });

  app.delete("/api/projects/:id/synthesis/in-flight", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    synthRepo.clearInFlight(project.scopeHash);
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/stats", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);

    const memories = repo.list({ projectId: project.id });
    const byType: Record<string, number> = {
      correction: 0,
      preference: 0,
      decision: 0,
      learning: 0,
      fact: 0,
    };
    for (const m of memories) byType[m.type] = (byType[m.type] ?? 0) + 1;

    const mostCommonType =
      memories.length > 0
        ? (Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
        : null;

    const needsReview = memories.filter((m) => m.reviewEvents.length > 0).length;
    const pinned = memories.filter((m) => m.pinned).length;

    const lastActive = memories.reduce((latest, m) => {
      const d = m.updatedAt > m.createdAt ? m.updatedAt : m.createdAt;
      return d > latest ? d : latest;
    }, "");

    const activeDaySet = new Set(memories.map((m) => m.createdAt.slice(0, 10)));

    const harnessCounts: Record<string, number> = {};
    for (const m of memories) {
      if (m.sourceHarness)
        harnessCounts[m.sourceHarness] = (harnessCounts[m.sourceHarness] ?? 0) + 1;
    }
    const harness = Object.entries(harnessCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return c.json({
      total: memories.length,
      byType,
      needsReview,
      pinned,
      mostCommonType,
      lastActive: lastActive || null,
      harness,
      activeDays: activeDaySet.size,
    });
  });

  app.get("/api/projects/:id/activity", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);

    const daysParam = Math.max(1, parseInt(c.req.query("days") ?? "365", 10));
    return c.json(aggregateActivity(repo.list({ projectId: project.id }), daysParam));
  });

  app.get("/api/activity", (c) => {
    const daysParam = Math.max(1, parseInt(c.req.query("days") ?? "365", 10));
    return c.json(aggregateActivity(repo.list(), daysParam));
  });

  app.get("/api/activity/events", (c) => {
    const { scope, type, since, limit } = c.req.query();

    let validatedType: ActivityEventType | undefined;
    if (type !== undefined) {
      const parsed = ActivityEventTypeSchema.safeParse(type);
      if (!parsed.success) {
        return c.json({ error: `Invalid event type: "${type}"` }, 400);
      }
      validatedType = parsed.data;
    }

    const events = listEvents(
      {
        scope: scope || undefined,
        type: validatedType,
        since: since || undefined,
        limit: limit !== undefined ? parseInt(limit, 10) : undefined,
      },
      activityRepo
    );
    return c.json(events);
  });

  return app;
}

export async function startDashboard(opts?: {
  port?: number;
  open?: boolean;
  onReady?: (port: number) => void;
}): Promise<void> {
  const port = await findFreePort(opts?.port ?? PREFERRED_PORT);

  const db = DatabaseManager.open();
  const embedding = new EmbeddingService();
  const projects = createProjectRepository(db);
  const repo = createMemoryRepository(db, projects);
  const activityLogger = createActivityLogger(db);
  const activityRepo = createActivityRepository(db);
  const queryEngine = new QueryEngine(db, embedding, repo, activityLogger);
  const synthRepo = createSynthesisRepository(db);

  const app = createApiApp(
    repo,
    projects,
    embedding,
    queryEngine,
    synthRepo,
    activityRepo,
    activityLogger
  );

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

  await new Promise<void>((resolve) => {
    serve({ fetch: app.fetch, port }, () => {
      opts?.onReady?.(port);
      resolve();
    });
  });

  if (opts?.open) await open(`http://localhost:${port}`);

  await new Promise<never>(() => {});
}
