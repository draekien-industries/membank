import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseManager } from "../../db/manager.js";
import { openTempDatabase, type TempDatabase } from "../../test-support/index.js";
import { DEFAULT_IN_FLIGHT_TIMEOUT_MS } from "../domain/extraction-policy.js";
import type { ExtractionRunRepository } from "../ports.js";
import { createExtractionRunRepository } from "./sqlite-extraction-run-repository.js";

describe("SqliteExtractionRunRepository — reapStale", () => {
  let temp: TempDatabase;
  let db: DatabaseManager;
  let runs: ExtractionRunRepository;

  beforeEach(() => {
    temp = openTempDatabase();
    db = temp.db;
    runs = createExtractionRunRepository(db);
  });

  afterEach(() => {
    temp.cleanup();
  });

  it("fails out in-flight runs older than the timeout", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    runs.tryClaim("stale", startedAt, {});

    const now = new Date(startedAt.getTime() + DEFAULT_IN_FLIGHT_TIMEOUT_MS + 1);
    expect(runs.reapStale(now, DEFAULT_IN_FLIGHT_TIMEOUT_MS)).toBe(1);

    const record = runs.get("stale");
    expect(record?.status).toBe("failed");
    expect(record?.error).toBe("reaped: exceeded in-flight timeout");
  });

  it("leaves in-flight runs inside the timeout alone", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    runs.tryClaim("fresh", startedAt, {});

    const now = new Date(startedAt.getTime() + DEFAULT_IN_FLIGHT_TIMEOUT_MS - 1);
    expect(runs.reapStale(now, DEFAULT_IN_FLIGHT_TIMEOUT_MS)).toBe(0);
    expect(runs.get("fresh")?.status).toBe("in_flight");
  });

  it("does not touch completed or failed runs", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    runs.tryClaim("done", startedAt, {});
    runs.markCompleted("done", startedAt);

    const now = new Date(startedAt.getTime() + DEFAULT_IN_FLIGHT_TIMEOUT_MS + 1);
    expect(runs.reapStale(now, DEFAULT_IN_FLIGHT_TIMEOUT_MS)).toBe(0);
    expect(runs.get("done")?.status).toBe("completed");
  });
});
