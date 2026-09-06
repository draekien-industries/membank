import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { RETENTION_DAYS } from "../domain/activity-event.js";
import type { ActivityLogger } from "../ports.js";
import { createActivityLogger, SqliteActivityRepository } from "./sqlite-activity-repository.js";

const SCOPE = "1111111111111111";
const OTHER_SCOPE = "2222222222222222";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("SqliteActivityRepository — insert and list", () => {
  let repo: SqliteActivityRepository;

  beforeEach(() => {
    repo = new SqliteActivityRepository(DatabaseManager.openInMemory());
  });

  function insert(overrides: {
    id: string;
    projectHash?: string;
    eventType?: "memory.created" | "memory.deleted" | "memory.queried";
    memoryId?: string | null;
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): void {
    repo.insert({
      id: overrides.id,
      projectHash: overrides.projectHash ?? SCOPE,
      eventType: overrides.eventType ?? "memory.created",
      memoryId: overrides.memoryId ?? null,
      payload: overrides.payload ?? {},
      createdAt: overrides.createdAt ?? new Date().toISOString(),
    });
  }

  it("lists nothing before anything is logged", () => {
    expect(repo.list({})).toEqual([]);
  });

  it("returns an inserted event in full", () => {
    insert({
      id: "e1",
      memoryId: "m1",
      payload: { content: "use tabs" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(repo.list({})).toEqual([
      {
        id: "e1",
        projectHash: SCOPE,
        eventType: "memory.created",
        memoryId: "m1",
        payload: { content: "use tabs" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("round-trips a structured payload rather than storing its string form", () => {
    insert({ id: "e1", payload: { tags: ["a", "b"], count: 2, nested: { ok: true } } });

    expect(repo.list({})[0]?.payload).toEqual({
      tags: ["a", "b"],
      count: 2,
      nested: { ok: true },
    });
  });

  it("orders newest first, so a feed reads top-down", () => {
    insert({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" });
    insert({ id: "new", createdAt: "2026-03-01T00:00:00.000Z" });

    expect(repo.list({}).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("narrows to one project scope", () => {
    insert({ id: "mine", projectHash: SCOPE });
    insert({ id: "theirs", projectHash: OTHER_SCOPE });

    expect(repo.list({ scope: SCOPE }).map((e) => e.id)).toEqual(["mine"]);
  });

  it("narrows to one event type", () => {
    insert({ id: "created", eventType: "memory.created" });
    insert({ id: "deleted", eventType: "memory.deleted" });

    expect(repo.list({ type: "memory.deleted" }).map((e) => e.id)).toEqual(["deleted"]);
  });

  it("includes events at the since boundary, not just after it", () => {
    insert({ id: "e1", createdAt: "2026-02-01T00:00:00.000Z" });

    expect(repo.list({ since: "2026-02-01T00:00:00.000Z" }).map((e) => e.id)).toEqual(["e1"]);
  });

  it("excludes events before the since boundary", () => {
    insert({ id: "before", createdAt: "2026-01-31T23:59:59.999Z" });

    expect(repo.list({ since: "2026-02-01T00:00:00.000Z" })).toEqual([]);
  });

  it("caps the result at the requested limit, keeping the newest", () => {
    insert({ id: "oldest", createdAt: "2026-01-01T00:00:00.000Z" });
    insert({ id: "middle", createdAt: "2026-02-01T00:00:00.000Z" });
    insert({ id: "newest", createdAt: "2026-03-01T00:00:00.000Z" });

    expect(repo.list({ limit: 2 }).map((e) => e.id)).toEqual(["newest", "middle"]);
  });

  it("applies every filter together", () => {
    insert({
      id: "match",
      projectHash: SCOPE,
      eventType: "memory.queried",
      createdAt: isoDaysAgo(1),
    });
    insert({ id: "wrong-scope", projectHash: OTHER_SCOPE, eventType: "memory.queried" });
    insert({ id: "wrong-type", projectHash: SCOPE, eventType: "memory.created" });
    insert({
      id: "too-old",
      projectHash: SCOPE,
      eventType: "memory.queried",
      createdAt: isoDaysAgo(90),
    });

    const found = repo.list({
      scope: SCOPE,
      type: "memory.queried",
      since: isoDaysAgo(7),
      limit: 10,
    });

    expect(found.map((e) => e.id)).toEqual(["match"]);
  });
});

describe("SqliteActivityRepository — prune", () => {
  let repo: SqliteActivityRepository;

  beforeEach(() => {
    repo = new SqliteActivityRepository(DatabaseManager.openInMemory());
  });

  function insert(id: string, createdAt: string): void {
    repo.insert({
      id,
      projectHash: SCOPE,
      eventType: "memory.created",
      memoryId: null,
      payload: {},
      createdAt,
    });
  }

  it("deletes events older than the cutoff", () => {
    insert("old", isoDaysAgo(90));

    repo.prune(isoDaysAgo(30));

    expect(repo.list({})).toEqual([]);
  });

  it("keeps events at or after the cutoff", () => {
    insert("recent", isoDaysAgo(1));

    repo.prune(isoDaysAgo(30));

    expect(repo.list({}).map((e) => e.id)).toEqual(["recent"]);
  });

  it("throttles repeat pruning, so a hot write path pays the delete cost once a minute", () => {
    insert("first", isoDaysAgo(90));
    repo.prune(isoDaysAgo(30));

    insert("second", isoDaysAgo(90));
    repo.prune(isoDaysAgo(30));

    expect(repo.list({}).map((e) => e.id)).toEqual(["second"]);
  });
});

describe("createActivityLogger", () => {
  let db: DatabaseManager;
  let logger: ActivityLogger;
  let repo: SqliteActivityRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    logger = createActivityLogger(db);
    repo = new SqliteActivityRepository(db);
  });

  it("assigns an id the caller did not have to supply", () => {
    logger.logEvent({ projectHash: SCOPE, eventType: "memory.created" });

    expect(repo.list({})[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("defaults an absent memory id to null rather than omitting the field", () => {
    logger.logEvent({ projectHash: SCOPE, eventType: "memory.queried" });

    expect(repo.list({})[0]?.memoryId).toBeNull();
  });

  it("defaults an absent payload to an empty object", () => {
    logger.logEvent({ projectHash: SCOPE, eventType: "memory.queried" });

    expect(repo.list({})[0]?.payload).toEqual({});
  });

  it("carries the caller's memory id and payload through", () => {
    logger.logEvent({
      projectHash: SCOPE,
      eventType: "memory.updated",
      memoryId: "m1",
      payload: { field: "content" },
    });

    expect(repo.list({})[0]).toMatchObject({
      projectHash: SCOPE,
      eventType: "memory.updated",
      memoryId: "m1",
      payload: { field: "content" },
    });
  });

  it("stamps the event with the current time", () => {
    const before = Date.now();

    logger.logEvent({ projectHash: SCOPE, eventType: "memory.created" });

    const createdAt = Date.parse(repo.list({})[0]?.createdAt ?? "");
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(Date.now());
  });

  it(`prunes events older than the ${RETENTION_DAYS}-day retention window`, () => {
    repo.insert({
      id: "ancient",
      projectHash: SCOPE,
      eventType: "memory.created",
      memoryId: null,
      payload: {},
      createdAt: isoDaysAgo(RETENTION_DAYS + 1),
    });

    logger.logEvent({ projectHash: SCOPE, eventType: "memory.created" });

    expect(repo.list({}).map((e) => e.id)).not.toContain("ancient");
  });

  it(`keeps events inside the ${RETENTION_DAYS}-day retention window`, () => {
    repo.insert({
      id: "recent",
      projectHash: SCOPE,
      eventType: "memory.created",
      memoryId: null,
      payload: {},
      createdAt: isoDaysAgo(RETENTION_DAYS - 1),
    });

    logger.logEvent({ projectHash: SCOPE, eventType: "memory.created" });

    expect(repo.list({}).map((e) => e.id)).toContain("recent");
  });
});
