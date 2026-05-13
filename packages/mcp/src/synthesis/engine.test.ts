import { DatabaseManager, SynthesisRepository } from "@membank/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SynthesisAgentLoop, SynthesisConfig } from "./agent-loop.js";
import { SynthesisEngine } from "./engine.js";

function makeConfig(overrides?: Partial<SynthesisConfig>): SynthesisConfig {
  return {
    enabled: true,
    debounceMs: 50,
    inFlightTimeoutMs: 120_000,
    ...overrides,
  };
}

function makeAgentLoop(result = "synthesized content"): SynthesisAgentLoop {
  return {
    run: vi.fn().mockResolvedValue(result),
  } as unknown as SynthesisAgentLoop;
}

describe("SynthesisEngine", () => {
  let db: DatabaseManager;
  let synthRepo: SynthesisRepository;
  let agentLoop: SynthesisAgentLoop;
  let engine: SynthesisEngine;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    synthRepo = new SynthesisRepository(db);
    agentLoop = makeAgentLoop();
    engine = new SynthesisEngine(db, synthRepo, makeConfig(), agentLoop);
  });

  afterEach(async () => {
    await engine.shutdown();
    db.close();
  });

  it("init() queues expired/dirty/missing scopes", async () => {
    db.db
      .prepare(
        `INSERT INTO projects (id, name, scope_hash, created_at, updated_at)
         VALUES ('p1', 'proj', 'proj-hash', datetime('now'), datetime('now'))`
      )
      .run();

    await engine.init();
    await engine.shutdown();

    // Both 'global' and 'proj-hash' should have been synthesized (missing → queued)
    const globalSynth = synthRepo.getSynthesis("global");
    const projSynth = synthRepo.getSynthesis("proj-hash");

    expect(globalSynth?.content).toBe("synthesized content");
    expect(projSynth?.content).toBe("synthesized content");
    expect(vi.mocked(agentLoop.run)).toHaveBeenCalledTimes(2);
  });

  it("markDirty() adds scope to dirty set so it gets processed next cycle", async () => {
    // Use a fresh engine that starts with no dirty scopes (empty DB), then add one
    const freshLoop = makeAgentLoop();
    const freshEngine = new SynthesisEngine(
      db,
      synthRepo,
      makeConfig({ debounceMs: 50 }),
      freshLoop
    );

    // init() will run the first pass (global is missing → queued)
    await freshEngine.init();

    // Clear mock to isolate the markDirty call
    vi.mocked(freshLoop.run).mockClear();

    freshEngine.markDirty("extra-scope");

    // Wait for the next debounce cycle to fire and complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    await freshEngine.shutdown();

    expect(vi.mocked(freshLoop.run)).toHaveBeenCalledWith("extra-scope", "extra-scope");
  });

  it("multiple markDirty() calls for the same scope result in one synthesis per cycle", async () => {
    await engine.init();
    await engine.shutdown();

    // reset call count from init
    vi.mocked(agentLoop.run).mockClear();

    const engine2 = new SynthesisEngine(db, synthRepo, makeConfig({ debounceMs: 50 }), agentLoop);

    engine2.markDirty("global");
    engine2.markDirty("global");
    engine2.markDirty("global");

    await engine2.init();
    await engine2.shutdown();

    const callsForGlobal = vi.mocked(agentLoop.run).mock.calls.filter(([s]) => s === "global");
    expect(callsForGlobal.length).toBe(1);
  });

  it("in-flight guard: skips scope if in_flight_since is recent", async () => {
    synthRepo.markInFlight("global");

    const engine2 = new SynthesisEngine(
      db,
      synthRepo,
      makeConfig({ debounceMs: 50, inFlightTimeoutMs: 120_000 }),
      agentLoop
    );

    engine2.markDirty("global");
    await engine2.init();
    await engine2.shutdown();

    expect(vi.mocked(agentLoop.run)).not.toHaveBeenCalledWith("global", undefined);
  });

  it("in-flight guard: allows resynthesis if in_flight_since is stale", async () => {
    synthRepo.saveSynthesis("global", "old content", "oldhash");

    // Manually set in_flight_since to 3 minutes ago (beyond timeout)
    const staleTime = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    db.db.prepare("UPDATE syntheses SET in_flight_since = ? WHERE scope = 'global'").run(staleTime);

    const engine2 = new SynthesisEngine(
      db,
      synthRepo,
      makeConfig({ debounceMs: 50, inFlightTimeoutMs: 120_000 }),
      agentLoop
    );

    engine2.markDirty("global");
    await engine2.init();
    await engine2.shutdown();

    expect(vi.mocked(agentLoop.run)).toHaveBeenCalledWith("global", undefined);
  });

  it("engine does not crash when agentLoop.run() throws", async () => {
    vi.mocked(agentLoop.run).mockRejectedValue(new Error("agent failed"));

    const errorEngine = new SynthesisEngine(db, synthRepo, makeConfig(), agentLoop);
    errorEngine.markDirty("global");

    await expect(errorEngine.init()).resolves.not.toThrow();
    await errorEngine.shutdown();
  });

  it("error in agent loop clears in_flight_since on the synthesis row", async () => {
    vi.mocked(agentLoop.run).mockRejectedValue(new Error("agent failed"));

    synthRepo.saveSynthesis("global", "content", "hash");

    const errorEngine = new SynthesisEngine(db, synthRepo, makeConfig(), agentLoop);
    errorEngine.markDirty("global");

    await errorEngine.init();
    await errorEngine.shutdown();

    const synth = synthRepo.getSynthesis("global");
    expect(synth?.inFlightSince).toBeNull();
  });
});
