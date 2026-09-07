import {
  createSynthesisRepository,
  DatabaseManager,
  SYNTHESIS_IN_FLIGHT_TIMEOUT_MS,
  type SynthesisRepository,
} from "@membank/core";
import { GLOBAL_SCOPE_HASH, seedSynthesis } from "@membank/core/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSynthesisRuns } from "./synthesis-runs.js";

const SCOPE = GLOBAL_SCOPE_HASH;

function agoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function pendingForever(): Promise<never> {
  return new Promise<never>(() => {});
}

describe("createSynthesisRuns", () => {
  let db: DatabaseManager;
  let synthRepo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    synthRepo = createSynthesisRepository(db);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it("reports nothing when the scope has no claim in flight", () => {
    seedSynthesis(db, { scope: SCOPE, memoryType: "preference", inFlightSince: null });

    expect(createSynthesisRuns(synthRepo).unlock(SCOPE)).toEqual({ unlocked: [], live: [] });
  });

  it("releases a claim whose owner is presumed dead", () => {
    seedSynthesis(db, {
      scope: SCOPE,
      memoryType: "preference",
      inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS),
    });

    const result = createSynthesisRuns(synthRepo).unlock(SCOPE);

    expect(result).toEqual({ unlocked: ["preference"], live: [] });
    expect(synthRepo.getSynthesis(SCOPE, "preference")?.inFlightSince).toBeNull();
  });

  it("holds a claim that is still within the timeout", () => {
    seedSynthesis(db, {
      scope: SCOPE,
      memoryType: "preference",
      inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS - 5_000),
    });

    const result = createSynthesisRuns(synthRepo).unlock(SCOPE);

    expect(result).toEqual({ unlocked: [], live: ["preference"] });
    expect(synthRepo.getSynthesis(SCOPE, "preference")?.inFlightSince).not.toBeNull();
  });

  it("holds a claim this process is still working on, however old it is", () => {
    seedSynthesis(db, {
      scope: SCOPE,
      memoryType: "preference",
      inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS * 10),
    });
    const runs = createSynthesisRuns(synthRepo);
    runs.claim(SCOPE, ["preference"], pendingForever);

    const result = runs.unlock(SCOPE);

    expect(result).toEqual({ unlocked: [], live: ["preference"] });
    expect(synthRepo.getSynthesis(SCOPE, "preference")?.inFlightSince).not.toBeNull();
  });

  it("releases the claim once the synthesis settles", async () => {
    seedSynthesis(db, {
      scope: SCOPE,
      memoryType: "preference",
      inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS),
    });
    const runs = createSynthesisRuns(synthRepo);
    runs.claim(SCOPE, ["preference"], () => Promise.resolve("done"));
    await vi.waitFor(() => {
      expect(runs.unlock(SCOPE).unlocked).toEqual(["preference"]);
    });
  });

  it("releases the claim when the synthesis rejects, without an unhandled rejection", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    seedSynthesis(db, {
      scope: SCOPE,
      memoryType: "preference",
      inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS),
    });
    const runs = createSynthesisRuns(synthRepo);
    runs.claim(SCOPE, ["preference"], () => Promise.reject(new Error("agent exploded")));

    await vi.waitFor(() => {
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("agent exploded"));
    });
    expect(runs.unlock(SCOPE).unlocked).toEqual(["preference"]);
  });

  it("tracks each type independently within a scope", () => {
    for (const memoryType of ["preference", "decision"] as const) {
      seedSynthesis(db, {
        scope: SCOPE,
        memoryType,
        inFlightSince: agoIso(SYNTHESIS_IN_FLIGHT_TIMEOUT_MS),
      });
    }
    const runs = createSynthesisRuns(synthRepo);
    runs.claim(SCOPE, ["preference"], pendingForever);

    expect(runs.unlock(SCOPE)).toEqual({ unlocked: ["decision"], live: ["preference"] });
  });
});
