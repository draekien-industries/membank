import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
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
  SynthesisRepository,
} from "@membank/core";
import {
  ActivityEventTypeSchema,
  clusterFlagged,
  collectSynthesisSections,
  createActivityLogger,
  createActivityRepository,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  DEFAULT_SYNTHESIS_THRESHOLD_WORDS,
  deleteManyMemories,
  deleteMemory,
  deleteProject,
  EmbeddingService,
  findWorktreeOrphan,
  GLOBAL_PROJECT_ID,
  GLOBAL_SCOPE_HASH,
  isSynthesisEnabled,
  listEvents,
  MEMORY_TYPE_VALUES,
  mergeMemories,
  mergeProjects,
  reconcileWorktreeOrphan,
  renderSessionContext,
  resolveReviewMany,
  revertMemory,
  revertSynthesis,
  runSynthesis,
  SessionContextBuilder,
  suggestMerge,
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

function resolveThresholdWords(): number {
  const configPath = join(homedir(), ".membank", "config.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { synthesis?: { synthesisThresholdWords?: unknown } };
    const configured = parsed.synthesis?.synthesisThresholdWords;
    return typeof configured === "number" ? configured : DEFAULT_SYNTHESIS_THRESHOLD_WORDS;
  } catch {
    return DEFAULT_SYNTHESIS_THRESHOLD_WORDS;
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

  app.get("/api/memories/flagged-clusters", (c) => {
    const projectIdParam = c.req.query("projectId");
    const project = projectIdParam
      ? projectRepo.list().find((p) => p.id === projectIdParam)
      : undefined;

    const edges = repo.listReviewEdges(project?.scopeHash);
    const clusters = clusterFlagged(edges);
    const inActiveCluster = new Set(clusters.flatMap((cl) => cl.memoryIds));

    const activeResults = clusters.map((cl) => {
      const memories = repo.findManyById(cl.memoryIds);
      const maxSimilarity = memories.reduce((max, m) => {
        const sim = m.reviewEvents.reduce((ms, e) => Math.max(ms, e.similarity), 0);
        return Math.max(max, sim);
      }, 0);
      return { clusterId: cl.clusterId, memories, maxSimilarity, isStale: false };
    });

    const staleResults = repo
      .list({ needsReview: true, ...(project && { projectId: project.id }) })
      .filter((m) => !inActiveCluster.has(m.id))
      .map((m) => ({ clusterId: m.id, memories: [m], maxSimilarity: 0, isStale: true }));

    return c.json(
      [...activeResults, ...staleResults].sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    );
  });

  app.post("/api/memories/merge", async (c) => {
    const body = await c.req.json<{
      keepId?: unknown;
      dropIds?: unknown;
      mergedContent?: unknown;
    }>();
    if (
      typeof body.keepId !== "string" ||
      !Array.isArray(body.dropIds) ||
      typeof body.mergedContent !== "string"
    ) {
      return c.json({ error: "keepId, dropIds, and mergedContent are required" }, 400);
    }
    try {
      const { kept } = await mergeMemories(
        {
          keepId: body.keepId,
          dropIds: body.dropIds as string[],
          mergedContent: body.mergedContent,
        },
        { repo, embedder, activityLogger }
      );
      return c.json(kept);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/api/memories/merge-suggest", async (c) => {
    if (!isSynthesisEnabled()) return c.json({ error: "Synthesis is disabled" }, 503);
    const body = await c.req.json<{ ids?: unknown }>();
    if (!Array.isArray(body.ids)) return c.json({ error: "ids array is required" }, 400);
    const memories = (body.ids as string[])
      .map((id) => repo.findById(id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
    if (memories.length === 0) return c.json({ error: "No memories found for given ids" }, 404);
    try {
      const content = await suggestMerge(memories.map((m) => m.content));
      return c.json({ content });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post("/api/memories/delete-many", async (c) => {
    const body = await c.req.json<{ ids?: unknown }>();
    if (!Array.isArray(body.ids)) return c.json({ error: "ids array is required" }, 400);
    const results = await deleteManyMemories(body.ids as string[], repo, activityLogger);
    return c.json(results);
  });

  app.post("/api/memories/resolve-many", async (c) => {
    const body = await c.req.json<{ ids?: unknown }>();
    if (!Array.isArray(body.ids)) return c.json({ error: "ids array is required" }, 400);
    const results = resolveReviewMany(body.ids as string[], repo);
    return c.json(results);
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
    return c.json(
      projectRepo.list().map((p) => ({ ...p, memoryCount: projectRepo.countMemories(p.id) }))
    );
  });

  app.get("/api/projects/orphan", async (c) => {
    const orphan = await findWorktreeOrphan(projectRepo);
    return c.json(orphan);
  });

  app.post("/api/projects/reconcile", async (c) => {
    const result = await reconcileWorktreeOrphan(projectRepo);
    return c.json(result);
  });

  app.patch("/api/projects/:id", async (c) => {
    const body = await c.req.json<{ name: string }>();
    try {
      return c.json(projectRepo.rename(c.req.param("id"), body.name));
    } catch {
      return c.json({ error: "Not found" }, 404);
    }
  });

  app.post("/api/projects/:id/merge", async (c) => {
    const body = await c.req.json<{ targetId?: unknown }>();
    if (typeof body.targetId !== "string") {
      return c.json({ error: "targetId is required" }, 400);
    }
    try {
      return c.json(mergeProjects(c.req.param("id"), body.targetId, projectRepo));
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    if (id === GLOBAL_PROJECT_ID) {
      return c.json({ error: "Cannot delete the global project" }, 400);
    }
    if (projectRepo.getById(id) === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    const { deletedMemories } = deleteProject(id, projectRepo, repo);
    return c.json({ ok: true, deletedMemories });
  });

  app.get("/api/stats", (c) => {
    const { byType, total, needsReview } = repo.stats();
    return c.json({ byType, total, needsReview });
  });

  app.get("/api/syntheses", (c) => {
    return c.json(synthRepo.listAll());
  });

  app.get("/api/projects/:id/session-context", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);

    const builder = new SessionContextBuilder(repo);
    const scopes =
      project.scopeHash === GLOBAL_SCOPE_HASH
        ? [{ scope: GLOBAL_SCOPE_HASH, synthesizable: true }]
        : [
            { scope: GLOBAL_SCOPE_HASH, synthesizable: false },
            { scope: project.scopeHash, synthesizable: true },
          ];
    const sections = collectSynthesisSections(synthRepo, scopes, resolveThresholdWords());
    const ctx = builder.getSessionContext(project.scopeHash, sections);

    return c.json({
      rendered: renderSessionContext(ctx),
      sections: ctx.sections,
      pinnedGlobal: ctx.pinnedGlobal,
      pinnedProject: ctx.pinnedProject,
      stats: ctx.stats,
    });
  });

  app.post("/api/projects/:id/synthesis", async (c) => {
    if (!isSynthesisEnabled()) return c.json({ error: "Synthesis is disabled" }, 503);
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    const body = await c.req
      .json<{ memoryType?: unknown }>()
      .catch((): { memoryType?: unknown } => ({}));
    const memoryType = MEMORY_TYPE_VALUES.find((type) => type === body.memoryType);
    const agentRunner = createSynthesisAgentRunner();
    void runSynthesis(
      project.scopeHash,
      { synthRepo, agentRunner },
      {
        ...(memoryType !== undefined && { type: memoryType }),
        thresholdWords: resolveThresholdWords(),
      }
    );
    return c.json({ ok: true }, 202);
  });

  app.delete("/api/projects/:id/synthesis/in-flight", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    for (const type of MEMORY_TYPE_VALUES) synthRepo.clearInFlight(project.scopeHash, type);
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/synthesis/history", (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    const versions = MEMORY_TYPE_VALUES.flatMap((type) =>
      synthRepo.listVersions(project.scopeHash, type)
    );
    return c.json(versions);
  });

  app.post("/api/projects/:id/synthesis/revert", async (c) => {
    const project = projectRepo.list().find((p) => p.id === c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json<{ version?: unknown; memoryType?: unknown }>();
    const version = typeof body.version === "number" ? body.version : NaN;
    if (Number.isNaN(version)) return c.json({ error: "version must be a number" }, 400);
    const memoryType = MEMORY_TYPE_VALUES.find((type) => type === body.memoryType);
    if (memoryType === undefined) return c.json({ error: "memoryType is required" }, 400);
    if (synthRepo.getVersion(project.scopeHash, memoryType, version) === undefined) {
      return c.json({ error: "Version not found" }, 404);
    }
    revertSynthesis(project.scopeHash, memoryType, version, synthRepo);
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
  const synthRepo = createSynthesisRepository(db);

  const app = createApiApp(repo, projects, embedding, synthRepo, activityRepo, activityLogger);

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
