import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { SynthesisRepository } from "./repository.js";

describe("SynthesisRepository", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = new SynthesisRepository(db);
  });

  it("saveSynthesis() writes to DB and returns a Synthesis", () => {
    const result = repo.saveSynthesis("global", "This is a synthesis.", "abc123");

    expect(result.scope).toBe("global");
    expect(result.content).toBe("This is a synthesis.");
    expect(result.sourceMemoryHash).toBe("abc123");
    expect(result.inFlightSince).toBeNull();
    expect(result.id).toBeTruthy();
    expect(result.synthesizedAt).toBeTruthy();
    expect(result.expiresAt > result.synthesizedAt).toBe(true);
  });

  it("saveSynthesis() updates existing synthesis for same scope", () => {
    repo.saveSynthesis("global", "first", "hash1");
    const updated = repo.saveSynthesis("global", "second", "hash2");

    expect(updated.content).toBe("second");
    expect(updated.sourceMemoryHash).toBe("hash2");

    const rows = db.db.prepare("SELECT COUNT(*) as count FROM syntheses").get() as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });

  it("getSynthesis() returns synthesis for known scope", () => {
    repo.saveSynthesis("global", "content", "hash");
    const result = repo.getSynthesis("global");

    expect(result).toBeDefined();
    expect(result?.scope).toBe("global");
    expect(result?.content).toBe("content");
  });

  it("getSynthesis() returns undefined for unknown scope", () => {
    const result = repo.getSynthesis("nonexistent-scope");
    expect(result).toBeUndefined();
  });

  it("computeSourceMemoryHash() returns consistent hash for same data", () => {
    const hash1 = repo.computeSourceMemoryHash("global");
    const hash2 = repo.computeSourceMemoryHash("global");
    expect(hash1).toBe(hash2);
  });

  it("computeSourceMemoryHash() returns different hash when memories differ", () => {
    const hashEmpty = repo.computeSourceMemoryHash("global");

    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES ('m1', 'some memory', 'preference', '[]', NULL, 0, 0, datetime('now'), datetime('now'))`
      )
      .run();

    const hashWithMemory = repo.computeSourceMemoryHash("global");
    expect(hashWithMemory).not.toBe(hashEmpty);
  });

  it("expireStale() deletes rows where expires_at < now", () => {
    const veryPast = new Date(Date.now() - 2000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const now = new Date().toISOString();

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s1', 'expired-scope', 'old', 'h1', ?, ?, ?, ?)`
      )
      .run(veryPast, pastExpiry, veryPast, now);

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s2', 'fresh-scope', 'new', 'h2', ?, ?, ?, ?)`
      )
      .run(now, futureExpiry, now, now);

    repo.expireStale();

    const remaining = db.db
      .prepare<[], { scope: string }>("SELECT scope FROM syntheses")
      .all()
      .map((r) => r.scope);

    expect(remaining).not.toContain("expired-scope");
    expect(remaining).toContain("fresh-scope");
  });

  it("getExpiredOrDirtyScopes() returns missing for scopes with no synthesis", () => {
    db.db
      .prepare(
        `INSERT INTO projects (id, name, scope_hash, created_at, updated_at)
         VALUES ('p1', 'test-project', 'abcdef0123456789', datetime('now'), datetime('now'))`
      )
      .run();

    const scopes = repo.getExpiredOrDirtyScopes();
    const scopeNames = scopes.map((s) => s.scope);

    expect(scopeNames).toContain("global");
    expect(scopeNames).toContain("abcdef0123456789");
    expect(scopes.every((s) => s.reason === "missing")).toBe(true);
  });

  it("getExpiredOrDirtyScopes() returns expired for syntheses past their TTL", () => {
    const veryPast = new Date(Date.now() - 2000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    const now = new Date().toISOString();

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s1', 'global', 'content', 'hash', ?, ?, ?, ?)`
      )
      .run(veryPast, past, veryPast, now);

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === "global");

    expect(globalScope?.reason).toBe("expired");
  });

  it("getExpiredOrDirtyScopes() returns dirty when source hash diverges", () => {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s1', 'global', 'content', 'stale-hash', ?, ?, ?, ?)`
      )
      .run(now, future, now, now);

    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES ('m1', 'new memory', 'preference', '[]', NULL, 0, 0, ?, ?)`
      )
      .run(now, now);

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === "global");

    expect(globalScope?.reason).toBe("dirty");
  });

  it("markInFlight() / clearInFlight() toggle in_flight_since", () => {
    repo.saveSynthesis("global", "content", "hash");

    repo.markInFlight("global");
    const inFlight = repo.getSynthesis("global");
    expect(inFlight?.inFlightSince).toBeTruthy();

    repo.clearInFlight("global");
    const cleared = repo.getSynthesis("global");
    expect(cleared?.inFlightSince).toBeNull();
  });
});
