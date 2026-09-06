import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import {
  DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  DEFAULT_RECENT_COMPLETION_MS,
} from "../domain/extraction-policy.js";
import type { ExtractionRunRepository } from "../ports.js";
import { createExtractionRunRepository } from "./sqlite-extraction-run-repository.js";

const T0 = new Date("2026-01-01T00:00:00.000Z");

function at(msAfterT0: number): Date {
  return new Date(T0.getTime() + msAfterT0);
}

describe("SqliteExtractionRunRepository — claim lifecycle", () => {
  let runs: ExtractionRunRepository;

  beforeEach(() => {
    runs = createExtractionRunRepository(DatabaseManager.openInMemory());
  });

  it("returns undefined for a session that has never run", () => {
    expect(runs.get("never")).toBeUndefined();
  });

  it("grants a first claim and records the run as in flight", () => {
    expect(runs.tryClaim("s1", T0, {})).toBe(true);

    expect(runs.get("s1")).toEqual({
      sessionId: "s1",
      startedAt: T0.toISOString(),
      completedAt: null,
      status: "in_flight",
      error: null,
    });
  });

  it("refuses a second claim while the first is still within the in-flight window", () => {
    runs.tryClaim("s1", T0, {});

    expect(runs.tryClaim("s1", at(DEFAULT_IN_FLIGHT_TIMEOUT_MS - 1), {})).toBe(false);
  });

  it("grants a claim once the in-flight window has elapsed, since the first run died", () => {
    runs.tryClaim("s1", T0, {});

    expect(runs.tryClaim("s1", at(DEFAULT_IN_FLIGHT_TIMEOUT_MS), {})).toBe(true);
  });

  it("refuses a claim shortly after a successful run, to avoid re-extracting the same session", () => {
    runs.tryClaim("s1", T0, {});
    runs.markCompleted("s1", at(1000));

    expect(runs.tryClaim("s1", at(1000 + DEFAULT_RECENT_COMPLETION_MS - 1), {})).toBe(false);
  });

  it("grants a claim once the recent-completion window has elapsed", () => {
    runs.tryClaim("s1", T0, {});
    runs.markCompleted("s1", at(1000));

    expect(runs.tryClaim("s1", at(1000 + DEFAULT_RECENT_COMPLETION_MS), {})).toBe(true);
  });

  it("grants an immediate retry after a failure, which is worth retrying", () => {
    runs.tryClaim("s1", T0, {});
    runs.markFailed("s1", at(1000), "ENOENT");

    expect(runs.tryClaim("s1", at(1001), {})).toBe(true);
  });

  it("honours a caller-supplied in-flight timeout over the default", () => {
    runs.tryClaim("s1", T0, {});

    expect(runs.tryClaim("s1", at(5000), { inFlightTimeoutMs: 1000 })).toBe(true);
  });

  it("resets the run to a clean in-flight state when re-claimed", () => {
    runs.tryClaim("s1", T0, {});
    runs.markFailed("s1", at(1000), "ENOENT");

    runs.tryClaim("s1", at(2000), {});

    expect(runs.get("s1")).toEqual({
      sessionId: "s1",
      startedAt: at(2000).toISOString(),
      completedAt: null,
      status: "in_flight",
      error: null,
    });
  });

  it("tracks each session id independently", () => {
    runs.tryClaim("s1", T0, {});

    expect(runs.tryClaim("s2", T0, {})).toBe(true);
    expect(runs.get("s1")?.status).toBe("in_flight");
  });
});

describe("SqliteExtractionRunRepository — markCompleted and markFailed", () => {
  let runs: ExtractionRunRepository;

  beforeEach(() => {
    runs = createExtractionRunRepository(DatabaseManager.openInMemory());
    runs.tryClaim("s1", T0, {});
  });

  it("stamps a completed run with its finish time and no error", () => {
    runs.markCompleted("s1", at(1000));

    expect(runs.get("s1")).toMatchObject({
      status: "completed",
      completedAt: at(1000).toISOString(),
      error: null,
    });
  });

  it("stamps a failed run with its finish time and the reason", () => {
    runs.markFailed("s1", at(1000), "agent timed out");

    expect(runs.get("s1")).toMatchObject({
      status: "failed",
      completedAt: at(1000).toISOString(),
      error: "agent timed out",
    });
  });

  it("clears a previous error when the run later succeeds", () => {
    runs.markFailed("s1", at(1000), "agent timed out");

    runs.markCompleted("s1", at(2000));

    expect(runs.get("s1")?.error).toBeNull();
  });

  it("leaves other sessions untouched", () => {
    runs.tryClaim("s2", T0, {});

    runs.markFailed("s1", at(1000), "boom");

    expect(runs.get("s2")?.status).toBe("in_flight");
  });

  it("is a no-op for a session that was never claimed", () => {
    runs.markFailed("never", at(1000), "boom");

    expect(runs.get("never")).toBeUndefined();
  });
});

describe("SqliteExtractionRunRepository — stats", () => {
  let runs: ExtractionRunRepository;

  const SINCE = at(-86_400_000);

  beforeEach(() => {
    runs = createExtractionRunRepository(DatabaseManager.openInMemory());
  });

  it("reports zeros when nothing has run", () => {
    expect(runs.stats(T0, SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS)).toEqual({
      total: 0,
      failed: 0,
      staleInFlight: 0,
    });
  });

  it("counts every run started inside the window", () => {
    runs.tryClaim("s1", T0, {});
    runs.tryClaim("s2", T0, {});

    expect(runs.stats(at(1000), SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS).total).toBe(2);
  });

  it("excludes runs that started before the window", () => {
    runs.tryClaim("old", at(-172_800_000), {});

    expect(runs.stats(T0, SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS).total).toBe(0);
  });

  it("counts failures as a subset of the total", () => {
    runs.tryClaim("ok", T0, {});
    runs.markCompleted("ok", at(1000));
    runs.tryClaim("bad", T0, {});
    runs.markFailed("bad", at(1000), "boom");

    expect(runs.stats(at(2000), SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS)).toMatchObject({
      total: 2,
      failed: 1,
    });
  });

  it("counts an in-flight run past the timeout as stale", () => {
    runs.tryClaim("stuck", T0, {});

    const stats = runs.stats(
      at(DEFAULT_IN_FLIGHT_TIMEOUT_MS + 1),
      SINCE,
      DEFAULT_IN_FLIGHT_TIMEOUT_MS
    );

    expect(stats.staleInFlight).toBe(1);
  });

  it("does not count a fresh in-flight run as stale", () => {
    runs.tryClaim("live", T0, {});

    const stats = runs.stats(at(1000), SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS);

    expect(stats.staleInFlight).toBe(0);
  });

  it("reports staleness all-time, not only inside the stats window", () => {
    runs.tryClaim("ancient", at(-172_800_000), {});

    const stats = runs.stats(T0, SINCE, DEFAULT_IN_FLIGHT_TIMEOUT_MS);

    expect(stats.total).toBe(0);
    expect(stats.staleInFlight).toBe(1);
  });
});
