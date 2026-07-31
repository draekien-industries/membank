import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { DEFAULT_IN_FLIGHT_TIMEOUT_MS } from "../domain/extraction-policy.js";
import type { ExtractionRunRepository } from "../ports.js";
import { createExtractionRunRepository } from "./sqlite-extraction-run-repository.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures");

describe.skipIf(!runIntegration)("SqliteExtractionRunRepository — reapStale", () => {
  let dbPath: string;
  let db: DatabaseManager;
  let runs: ExtractionRunRepository;

  beforeEach(() => {
    mkdirSync(fixturesDir, { recursive: true });
    dbPath = join(fixturesDir, `${randomUUID()}.db`);
    db = DatabaseManager.open(dbPath);
    runs = createExtractionRunRepository(db);
  });

  afterEach(() => {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(dbPath + suffix, { force: true });
    }
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
