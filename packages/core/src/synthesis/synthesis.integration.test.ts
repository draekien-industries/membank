import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { EmbeddingService } from "../embedding/index.js";
import type { MemoryRepository } from "../memory/index.js";
import { createMemoryRepository, saveMemory } from "../memory/index.js";
import { createProjectRepository } from "../project/index.js";
import { createQueryEngine, type QueryEngine } from "../query/index.js";
import { runSynthesis } from "./application/run-synthesis.js";
import { createSynthesisAgentRunner } from "./infrastructure/claude-agent-runner.js";
import { createSynthesisRepository } from "./infrastructure/sqlite-synthesis-repository.js";
import type { SynthesisTools } from "./ports.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures");
const AGENT_TIMEOUT_MS = 180_000;

function buildLocalSynthesisTools(
  repo: MemoryRepository,
  query: QueryEngine,
  projectHash: string
): SynthesisTools {
  return {
    queryMemory: async (args) => {
      const results = await query.query({
        query: args.query,
        projectHash: args.global === true ? undefined : (args.projectHash ?? projectHash),
        limit: args.limit ?? 20,
        includePinned: true,
      });
      return JSON.stringify(results);
    },
    getMemorySummary: async () => JSON.stringify(repo.stats()),
  };
}

describe.skipIf(!runIntegration)("synthesis — integration (real Claude Haiku agent)", () => {
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

  it("synthesises the SDK-injected memories only (not the host's globally-configured DB)", {
    timeout: AGENT_TIMEOUT_MS,
  }, async () => {
    const db = DatabaseManager.open(dbPath);
    manager = db;
    const projectHash = "fedcba9876543210";
    const projects = createProjectRepository(db);
    projects.upsertByHash(projectHash, "membank-int-synth");
    const repo = createMemoryRepository(db, projects);
    const embedding = new EmbeddingService();
    const queryEngine = createQueryEngine(db, embedding);
    const synthRepo = createSynthesisRepository(db);

    // Seed unique, distinctive memories. If the agent reads from the host's real
    // ~/.membank/memory.db (via the bleed-through `mcp__membank__*` tools), it
    // won't find these distinctive tokens and the synthesis will reflect host data.
    await saveMemory(
      {
        content: "Project standardises on the Bun runtime for all build scripts.",
        type: "decision",
        projectScope: { hash: projectHash, name: "membank-int-synth" },
        sourceHarness: "membank-test",
      },
      { repo, embedder: embedding }
    );
    await saveMemory(
      {
        content: "Never commit .vault files; they contain decryption keys.",
        type: "correction",
        projectScope: { hash: projectHash, name: "membank-int-synth" },
        sourceHarness: "membank-test",
      },
      { repo, embedder: embedding }
    );

    const tools = buildLocalSynthesisTools(repo, queryEngine, projectHash);
    const agentRunner = createSynthesisAgentRunner(tools, { enabled: true });

    const content = await runSynthesis(projectHash, { synthRepo, agentRunner });

    // Topical keyword check: the synthesis must reflect at least one of the two
    // seeded memories. "Bun" and ".vault" are distinctive enough that they could
    // only appear if the agent actually queried OUR isolated DB.
    const lower = content.toLowerCase();
    const referencesBun = lower.includes("bun");
    const referencesVault = lower.includes("vault");
    expect(referencesBun || referencesVault).toBe(true);

    // Persisted in our local syntheses table.
    const stored = synthRepo.getSynthesis(projectHash);
    expect(stored?.content).toBe(content);
    expect(stored?.inFlightSince).toBeNull();
  });
});
