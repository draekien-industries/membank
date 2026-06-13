import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH } from "../project/domain/global-scope.js";
import type { MemoryType } from "../schemas.js";
import { SynthesisEngine } from "./application/engine.js";
import { createSynthesisRepository } from "./infrastructure/sqlite-synthesis-repository.js";
import type { AgentRunner, SynthesisConfig, SynthesisRepository } from "./ports.js";

const EXTRA_SCOPE = "1234567890abcdef";

function makeConfig(overrides?: Partial<SynthesisConfig>): SynthesisConfig {
  return {
    enabled: true,
    debounceMs: 50,
    inFlightTimeoutMs: 120_000,
    synthesisThresholdWords: 0,
    ...overrides,
  };
}

function makeAgentRunner(result = "synthesized content"): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue(result),
  } as unknown as AgentRunner;
}

function insertProject(db: DatabaseManager, scopeHash: string): string {
  const id = `proj-${scopeHash}`;
  db.db
    .prepare(
      `INSERT OR IGNORE INTO projects (id, name, scope_hash, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(id, `proj-${scopeHash}`, scopeHash);
  return id;
}

function insertMemory(
  db: DatabaseManager,
  opts: { scope: string; type?: MemoryType; content?: string; pinned?: boolean }
): void {
  const id = `mem-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  const projectId =
    opts.scope === GLOBAL_SCOPE_HASH ? GLOBAL_PROJECT_ID : insertProject(db, opts.scope);
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
       VALUES (?, ?, ?, '[]', NULL, 0, ?, ?, ?)`
    )
    .run(id, opts.content ?? "a memory", opts.type ?? "preference", opts.pinned ? 1 : 0, now, now);
  db.db
    .prepare(`INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)`)
    .run(id, projectId);
}

describe("SynthesisEngine", () => {
  let db: DatabaseManager;
  let synthRepo: SynthesisRepository;
  let agentRunner: AgentRunner;
  let engine: SynthesisEngine;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    synthRepo = createSynthesisRepository(db);
    agentRunner = makeAgentRunner();
    engine = new SynthesisEngine(synthRepo, makeConfig(), agentRunner);
  });

  afterEach(async () => {
    await engine.shutdown();
    db.close();
  });

  it("init() queues expired/dirty/missing scopes", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    insertMemory(db, { scope: "abcdef0123456789", type: "preference" });

    await engine.init();
    await engine.shutdown();

    const globalSynth = synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference");
    const projSynth = synthRepo.getSynthesis("abcdef0123456789", "preference");

    expect(globalSynth?.content).toBe("synthesized content");
    expect(projSynth?.content).toBe("synthesized content");
    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledTimes(2);
  });

  it("generates one synthesis per non-empty MemoryType in a dirty scope", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "correction" });
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "decision" });
    // learning and fact have no memories — must not be synthesized.

    await engine.init();
    await engine.shutdown();

    const typesCalled = vi
      .mocked(agentRunner.run)
      .mock.calls.map(([, type]) => type)
      .sort();
    expect(typesCalled).toEqual(["correction", "decision", "preference"]);

    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "correction")?.content).toBe(
      "synthesized content"
    );
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "learning")).toBeUndefined();
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "fact")).toBeUndefined();
  });

  it("never feeds pinned memories into a synthesis", async () => {
    insertMemory(db, {
      scope: GLOBAL_SCOPE_HASH,
      type: "preference",
      content: "non-pinned visible",
    });
    insertMemory(db, {
      scope: GLOBAL_SCOPE_HASH,
      type: "preference",
      content: "PINNED secret",
      pinned: true,
    });

    await engine.init();
    await engine.shutdown();

    const preferenceCall = vi
      .mocked(agentRunner.run)
      .mock.calls.find(([, type]) => type === "preference");
    expect(preferenceCall).toBeDefined();
    const memoriesArg = preferenceCall?.[2] ?? [];
    expect(memoriesArg).toContain("non-pinned visible");
    expect(memoriesArg).not.toContain("PINNED secret");
  });

  it("does not synthesize a type whose only memories are pinned", async () => {
    insertMemory(db, {
      scope: GLOBAL_SCOPE_HASH,
      type: "fact",
      content: "pinned only",
      pinned: true,
    });

    await engine.init();
    await engine.shutdown();

    expect(vi.mocked(agentRunner.run)).not.toHaveBeenCalled();
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "fact")).toBeUndefined();
  });

  it("markDirty() adds scope to dirty set so it gets processed next cycle", async () => {
    insertMemory(db, { scope: EXTRA_SCOPE, type: "preference" });

    const freshRunner = makeAgentRunner();
    const freshEngine = new SynthesisEngine(synthRepo, makeConfig({ debounceMs: 50 }), freshRunner);

    await freshEngine.init();

    vi.mocked(freshRunner.run).mockClear();

    freshEngine.markDirty(EXTRA_SCOPE);

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    await freshEngine.shutdown();

    expect(vi.mocked(freshRunner.run)).toHaveBeenCalledWith(
      EXTRA_SCOPE,
      "preference",
      expect.anything()
    );
  });

  it("multiple markDirty() calls for the same scope result in one synthesis per cycle", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });

    await engine.init();
    await engine.shutdown();

    vi.mocked(agentRunner.run).mockClear();

    const engine2 = new SynthesisEngine(synthRepo, makeConfig({ debounceMs: 50 }), agentRunner);

    engine2.markDirty(GLOBAL_SCOPE_HASH);
    engine2.markDirty(GLOBAL_SCOPE_HASH);
    engine2.markDirty(GLOBAL_SCOPE_HASH);

    await engine2.init();
    await engine2.shutdown();

    const callsForGlobal = vi
      .mocked(agentRunner.run)
      .mock.calls.filter(([s]) => s === GLOBAL_SCOPE_HASH);
    expect(callsForGlobal.length).toBe(1);
  });

  it("in-flight guard: skips scope if in_flight_since is recent", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    synthRepo.markInFlight(GLOBAL_SCOPE_HASH, "preference");

    const engine2 = new SynthesisEngine(
      synthRepo,
      makeConfig({ debounceMs: 50, inFlightTimeoutMs: 120_000 }),
      agentRunner
    );

    engine2.markDirty(GLOBAL_SCOPE_HASH);
    await engine2.init();
    await engine2.shutdown();

    expect(vi.mocked(agentRunner.run)).not.toHaveBeenCalled();
  });

  it("in-flight guard: allows resynthesis if in_flight_since is stale", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    synthRepo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "old content", "oldhash");

    const staleTime = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    db.db
      .prepare(`UPDATE syntheses SET in_flight_since = ? WHERE scope = ?`)
      .run(staleTime, GLOBAL_SCOPE_HASH);

    const engine2 = new SynthesisEngine(
      synthRepo,
      makeConfig({ debounceMs: 50, inFlightTimeoutMs: 120_000 }),
      agentRunner
    );

    engine2.markDirty(GLOBAL_SCOPE_HASH);
    await engine2.init();
    await engine2.shutdown();

    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledWith(
      GLOBAL_SCOPE_HASH,
      "preference",
      expect.anything()
    );
  });

  it("engine does not crash when agentRunner.run() throws", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    vi.mocked(agentRunner.run).mockRejectedValue(new Error("agent failed"));

    const errorEngine = new SynthesisEngine(synthRepo, makeConfig(), agentRunner);
    errorEngine.markDirty(GLOBAL_SCOPE_HASH);

    await expect(errorEngine.init()).resolves.not.toThrow();
    await errorEngine.shutdown();
  });

  it("error in agent runner clears in_flight_since on the synthesis row", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    vi.mocked(agentRunner.run).mockRejectedValue(new Error("agent failed"));

    synthRepo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "content", "hash");

    const errorEngine = new SynthesisEngine(synthRepo, makeConfig(), agentRunner);
    errorEngine.markDirty(GLOBAL_SCOPE_HASH);

    await errorEngine.init();
    await errorEngine.shutdown();

    const synth = synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference");
    expect(synth?.inFlightSince).toBeNull();
  });
});

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `w${i}`).join(" ");
}

describe("SynthesisEngine threshold gating", () => {
  let db: DatabaseManager;
  let synthRepo: SynthesisRepository;
  let agentRunner: AgentRunner;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    synthRepo = createSynthesisRepository(db);
    agentRunner = makeAgentRunner();
  });

  afterEach(() => {
    db.close();
  });

  async function runOnce(threshold: number): Promise<void> {
    const engine = new SynthesisEngine(
      synthRepo,
      makeConfig({ synthesisThresholdWords: threshold }),
      agentRunner
    );
    await engine.init();
    await engine.shutdown();
  }

  it("skips a group whose word count is just below the threshold", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: words(149) });

    await runOnce(150);

    expect(vi.mocked(agentRunner.run)).not.toHaveBeenCalled();
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")).toBeUndefined();
  });

  it("generates a synthesis for a group whose word count is exactly at the threshold", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: words(150) });

    await runOnce(150);

    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledTimes(1);
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")?.content).toBe(
      "synthesized content"
    );
  });

  it("generates a synthesis for a group whose word count is just above the threshold", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: words(151) });

    await runOnce(150);

    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledTimes(1);
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")?.content).toBe(
      "synthesized content"
    );
  });

  it("a non-default threshold moves a group from the verbatim path to the synthesized path", async () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: words(50) });

    await runOnce(150);
    expect(vi.mocked(agentRunner.run)).not.toHaveBeenCalled();
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")).toBeUndefined();

    await runOnce(40);
    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledTimes(1);
    expect(synthRepo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")?.content).toBe(
      "synthesized content"
    );
  });
});
