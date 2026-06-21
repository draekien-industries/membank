import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { EmbeddingService } from "../embedding/index.js";
import type { MemoryRepository } from "../memory/index.js";
import { createMemoryRepository, saveMemory, updateMemory } from "../memory/index.js";
import { createProjectRepository } from "../project/index.js";
import { createQueryEngine, type QueryEngine } from "../query/index.js";
import { runExtraction } from "./application/run-extraction.js";
import { createExtractionAgentRunner } from "./infrastructure/claude-agent-runner.js";
import { createExtractionRunRepository } from "./infrastructure/sqlite-extraction-run-repository.js";
import { createClaudeCodeTranscriptReader } from "./infrastructure/transcript-reader.js";
import type { ExtractionTools } from "./ports.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures");
const AGENT_TIMEOUT_MS = 180_000;

function buildLocalExtractionTools(
  repo: MemoryRepository,
  query: QueryEngine,
  embedder: EmbeddingService,
  projectHash: string,
  projectName: string
): ExtractionTools {
  return {
    queryMemory: async (args) => {
      const results = await query.query({
        query: args.query,
        scope:
          args.global === true
            ? { tag: "global" }
            : { tag: "current", projectHash: args.projectHash ?? projectHash },
        limit: args.limit ?? 10,
        includePinned: true,
      });
      return JSON.stringify(results);
    },
    saveMemory: async (args) => {
      const target =
        args.global === true
          ? ({ tag: "global" } as const)
          : ({ tag: "project", scope: { hash: projectHash, name: projectName } } as const);
      const memory = await saveMemory(
        {
          content: args.content,
          type: args.type as "correction" | "preference" | "decision" | "learning" | "fact",
          ...(args.tags !== undefined && { tags: args.tags }),
          target,
          sourceHarness: "membank-extraction",
        },
        { repo, embedder }
      );
      return JSON.stringify(memory);
    },
    updateMemory: async (args) => {
      const memory = await updateMemory(
        args.id,
        {
          content: args.content,
          type: args.type as
            | "correction"
            | "preference"
            | "decision"
            | "learning"
            | "fact"
            | undefined,
          tags: args.tags,
        },
        { repo, embedder }
      );
      return JSON.stringify(memory);
    },
  };
}

function transcriptLine(role: "user" | "assistant", text: string): string {
  return JSON.stringify({
    type: role,
    message: {
      role,
      content: role === "assistant" ? [{ type: "text", text }] : text,
    },
  });
}

describe.skipIf(!runIntegration)("extraction — integration (real Claude Haiku agent)", () => {
  let dbPath: string;
  let manager: DatabaseManager | undefined;

  beforeEach(() => {
    mkdirSync(fixturesDir, { recursive: true });
    dbPath = join(fixturesDir, `${randomUUID()}.db`);
  });

  afterEach(() => {
    manager?.close();
    manager = undefined;
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(dbPath + suffix, { force: true });
    }
  });

  function setupWorld(projectName: string): {
    db: DatabaseManager;
    projectHash: string;
    tools: ExtractionTools;
    runRepo: ReturnType<typeof createExtractionRunRepository>;
  } {
    const db = DatabaseManager.open(dbPath);
    manager = db;
    const projectHash = "0123456789abcdef";
    const projects = createProjectRepository(db);
    projects.upsertByHash(projectHash, projectName);
    const repo = createMemoryRepository(db, projects);
    const embedding = new EmbeddingService();
    const queryEngine = createQueryEngine(db, embedding);
    const tools = buildLocalExtractionTools(repo, queryEngine, embedding, projectHash, projectName);
    const runRepo = createExtractionRunRepository(db);
    return { db, projectHash, tools, runRepo };
  }

  function writeTranscript(lines: string[]): string {
    const path = join(fixturesDir, `${randomUUID()}.jsonl`);
    writeFileSync(path, lines.join("\n"), "utf8");
    return path;
  }

  it("saves at least one memory when the transcript contains an explicit correction and decision", {
    timeout: AGENT_TIMEOUT_MS,
  }, async () => {
    const world = setupWorld("membank-int-correction");
    const transcript = [
      transcriptLine(
        "user",
        "Stop running `npm install` in this repo. We use pnpm via corepack — always use `pnpm add` for new dependencies and `pnpm install` for setup. This is non-negotiable; the package-lock.json from npm will break things."
      ),
      transcriptLine(
        "assistant",
        "Understood. I will use pnpm exclusively in this repo from now on."
      ),
      transcriptLine(
        "user",
        "Also, for this project we've decided to standardise on TanStack Router for all routing. Don't suggest react-router-dom or any alternative — we picked TanStack Router because of typed routes."
      ),
      transcriptLine("assistant", "Got it — TanStack Router only."),
    ];
    const transcriptPath = writeTranscript(transcript);

    const agent = createExtractionAgentRunner(world.tools);

    const result = await runExtraction(
      {
        sessionId: `int-corr-${randomUUID()}`,
        transcriptPath,
        projectHash: world.projectHash,
      },
      {
        repo: world.runRepo,
        transcripts: createClaudeCodeTranscriptReader(),
        agent,
        config: {},
      }
    );

    expect(result.status).toBe("completed");

    const memories = world.db.db
      .prepare<[], { content: string; type: string }>(
        "SELECT content, type FROM memories ORDER BY created_at"
      )
      .all();
    // The agent must save at least one memory: the corrections and decisions above are
    // exactly the durable signal the system prompt instructs it to capture.
    expect(memories.length).toBeGreaterThanOrEqual(1);
    // Loose content assertion — the agent paraphrases, so we check for topical keywords
    // rather than exact strings. At minimum one of the durable signals must surface.
    const joined = memories.map((m) => m.content.toLowerCase()).join(" | ");
    const mentionsPnpm = joined.includes("pnpm");
    const mentionsTanstack = joined.includes("tanstack");
    expect(mentionsPnpm || mentionsTanstack).toBe(true);
  });

  it("saves zero memories when the transcript has nothing durable to extract", {
    timeout: AGENT_TIMEOUT_MS,
  }, async () => {
    const world = setupWorld("membank-int-trivial");
    const transcript = [
      transcriptLine("user", "hello"),
      transcriptLine("assistant", "Hi! How can I help?"),
      transcriptLine("user", "what time is it?"),
      transcriptLine(
        "assistant",
        "I don't have access to a real-time clock, but I can help with your code."
      ),
      transcriptLine("user", "ok thanks, never mind for now"),
      transcriptLine("assistant", "No problem — let me know if you need anything."),
    ];
    const transcriptPath = writeTranscript(transcript);

    const agent = createExtractionAgentRunner(world.tools);

    const result = await runExtraction(
      {
        sessionId: `int-triv-${randomUUID()}`,
        transcriptPath,
        projectHash: world.projectHash,
      },
      {
        repo: world.runRepo,
        transcripts: createClaudeCodeTranscriptReader(),
        agent,
        config: {},
      }
    );

    expect(result.status).toBe("completed");

    const count = world.db.db
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM memories")
      .get();
    // The system prompt instructs the agent to skip transient/ephemeral content. A
    // chit-chat transcript with no corrections, preferences, decisions, learnings, or
    // facts must result in zero saved memories.
    expect(count?.n ?? -1).toBe(0);

    const run = world.runRepo.get(`int-triv-${randomUUID()}`);
    // The specific session id is randomised per-test, but the run we just executed must
    // be recorded — verify by listing all runs.
    const rows = world.db.db
      .prepare<[], { status: string }>("SELECT status FROM extraction_runs")
      .all();
    expect(rows.map((r) => r.status)).toEqual(["completed"]);
    expect(run).toBeUndefined();
  });
});
