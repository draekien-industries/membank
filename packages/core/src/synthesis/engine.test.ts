import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { GLOBAL_SCOPE_HASH } from "../project/domain/global-scope.js";
import { SynthesisEngine } from "./application/engine.js";
import { createSynthesisRepository } from "./infrastructure/sqlite-synthesis-repository.js";
import type { AgentRunner, SynthesisConfig, SynthesisRepository } from "./ports.js";

const EXTRA_SCOPE = "1234567890abcdef";

function makeConfig(overrides?: Partial<SynthesisConfig>): SynthesisConfig {
  return {
    enabled: true,
    debounceMs: 50,
    inFlightTimeoutMs: 120_000,
    ...overrides,
  };
}

function makeAgentRunner(result = "synthesized content"): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue(result),
  } as unknown as AgentRunner;
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
    db.db
      .prepare(
        `INSERT INTO projects (id, name, scope_hash, created_at, updated_at)
         VALUES ('p1', 'proj', 'abcdef0123456789', datetime('now'), datetime('now'))`
      )
      .run();

    await engine.init();
    await engine.shutdown();

    const globalSynth = synthRepo.getSynthesis(GLOBAL_SCOPE_HASH);
    const projSynth = synthRepo.getSynthesis("abcdef0123456789");

    expect(globalSynth?.content).toBe("synthesized content");
    expect(projSynth?.content).toBe("synthesized content");
    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledTimes(2);
  });

  it("markDirty() adds scope to dirty set so it gets processed next cycle", async () => {
    db.db
      .prepare(
        `INSERT INTO projects (id, name, scope_hash, created_at, updated_at)
         VALUES ('p2', 'extra', ?, datetime('now'), datetime('now'))`
      )
      .run(EXTRA_SCOPE);

    const freshRunner = makeAgentRunner();
    const freshEngine = new SynthesisEngine(synthRepo, makeConfig({ debounceMs: 50 }), freshRunner);

    await freshEngine.init();

    vi.mocked(freshRunner.run).mockClear();

    freshEngine.markDirty(EXTRA_SCOPE);

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    await freshEngine.shutdown();

    expect(vi.mocked(freshRunner.run)).toHaveBeenCalledWith(EXTRA_SCOPE, EXTRA_SCOPE);
  });

  it("multiple markDirty() calls for the same scope result in one synthesis per cycle", async () => {
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
    synthRepo.markInFlight(GLOBAL_SCOPE_HASH);

    const engine2 = new SynthesisEngine(
      synthRepo,
      makeConfig({ debounceMs: 50, inFlightTimeoutMs: 120_000 }),
      agentRunner
    );

    engine2.markDirty(GLOBAL_SCOPE_HASH);
    await engine2.init();
    await engine2.shutdown();

    expect(vi.mocked(agentRunner.run)).not.toHaveBeenCalledWith(GLOBAL_SCOPE_HASH, undefined);
  });

  it("in-flight guard: allows resynthesis if in_flight_since is stale", async () => {
    synthRepo.saveSynthesis(GLOBAL_SCOPE_HASH, "old content", "oldhash");

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

    expect(vi.mocked(agentRunner.run)).toHaveBeenCalledWith(GLOBAL_SCOPE_HASH, undefined);
  });

  it("engine does not crash when agentRunner.run() throws", async () => {
    vi.mocked(agentRunner.run).mockRejectedValue(new Error("agent failed"));

    const errorEngine = new SynthesisEngine(synthRepo, makeConfig(), agentRunner);
    errorEngine.markDirty(GLOBAL_SCOPE_HASH);

    await expect(errorEngine.init()).resolves.not.toThrow();
    await errorEngine.shutdown();
  });

  it("error in agent runner clears in_flight_since on the synthesis row", async () => {
    vi.mocked(agentRunner.run).mockRejectedValue(new Error("agent failed"));

    synthRepo.saveSynthesis(GLOBAL_SCOPE_HASH, "content", "hash");

    const errorEngine = new SynthesisEngine(synthRepo, makeConfig(), agentRunner);
    errorEngine.markDirty(GLOBAL_SCOPE_HASH);

    await errorEngine.init();
    await errorEngine.shutdown();

    const synth = synthRepo.getSynthesis(GLOBAL_SCOPE_HASH);
    expect(synth?.inFlightSince).toBeNull();
  });
});
