import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { SynthesisRepository } from "../ports.js";
import { createSynthesisRepository } from "./sqlite-synthesis-repository.js";

const EXPIRED_SCOPE = "aabbccddeeff0011";
const FRESH_SCOPE = "1100ffeeddccbbaa";

function insertProject(db: DatabaseManager, scopeHash: string): void {
  db.db
    .prepare(
      `INSERT OR IGNORE INTO projects (id, name, scope_hash, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), 'test-' || ?, ?, datetime('now'), datetime('now'))`
    )
    .run(scopeHash, scopeHash);
}

describe("SqliteSynthesisRepository", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
  });

  it("saveSynthesis() writes to DB and returns a Synthesis", () => {
    const result = repo.saveSynthesis(GLOBAL_SCOPE_HASH, "This is a synthesis.", "abc123");

    expect(result.scope).toBe(GLOBAL_SCOPE_HASH);
    expect(result.content).toBe("This is a synthesis.");
    expect(result.sourceMemoryHash).toBe("abc123");
    expect(result.inFlightSince).toBeNull();
    expect(result.id).toBeTruthy();
    expect(result.synthesizedAt).toBeTruthy();
    expect(result.expiresAt > result.synthesizedAt).toBe(true);
  });

  it("saveSynthesis() updates existing synthesis for same scope", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "first", "hash1");
    const updated = repo.saveSynthesis(GLOBAL_SCOPE_HASH, "second", "hash2");

    expect(updated.content).toBe("second");
    expect(updated.sourceMemoryHash).toBe("hash2");

    const rows = db.db.prepare("SELECT COUNT(*) as count FROM syntheses").get() as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });

  it("getSynthesis() returns synthesis for known scope", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "content", "hash");
    const result = repo.getSynthesis(GLOBAL_SCOPE_HASH);

    expect(result).toBeDefined();
    expect(result?.scope).toBe(GLOBAL_SCOPE_HASH);
    expect(result?.content).toBe("content");
  });

  it("getSynthesis() returns undefined for unknown scope", () => {
    const result = repo.getSynthesis("ccccddddeeee0000");
    expect(result).toBeUndefined();
  });

  it("sourceMemoryHash() returns consistent hash for same data", () => {
    const hash1 = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH);
    const hash2 = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH);
    expect(hash1).toBe(hash2);
  });

  it("sourceMemoryHash() returns different hash when memories differ", () => {
    const hashEmpty = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH);

    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES ('m1', 'some memory', 'preference', '[]', NULL, 0, 0, datetime('now'), datetime('now'))`
      )
      .run();
    db.db
      .prepare(
        `INSERT INTO memory_projects (memory_id, project_id) VALUES ('m1', '00000000-0000-0000-0000-000000000000')`
      )
      .run();

    const hashWithMemory = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH);
    expect(hashWithMemory).not.toBe(hashEmpty);
  });

  it("expireStale() deletes rows where expires_at < now", () => {
    insertProject(db, EXPIRED_SCOPE);
    insertProject(db, FRESH_SCOPE);

    const veryPast = new Date(Date.now() - 2000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const now = new Date().toISOString();

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s1', ?, 'old', 'h1', ?, ?, ?, ?)`
      )
      .run(EXPIRED_SCOPE, veryPast, pastExpiry, veryPast, now);

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s2', ?, 'new', 'h2', ?, ?, ?, ?)`
      )
      .run(FRESH_SCOPE, now, futureExpiry, now, now);

    repo.expireStale();

    const remaining = db.db
      .prepare<[], { scope: string }>("SELECT scope FROM syntheses")
      .all()
      .map((r) => r.scope);

    expect(remaining).not.toContain(EXPIRED_SCOPE);
    expect(remaining).toContain(FRESH_SCOPE);
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

    expect(scopeNames).toContain(GLOBAL_SCOPE_HASH);
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
         VALUES ('s1', ?, 'content', 'hash', ?, ?, ?, ?)`
      )
      .run(GLOBAL_SCOPE_HASH, veryPast, past, veryPast, now);

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === GLOBAL_SCOPE_HASH);

    expect(globalScope?.reason).toBe("expired");
  });

  it("getExpiredOrDirtyScopes() returns dirty when source hash diverges", () => {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
         VALUES ('s1', ?, 'content', 'stale-hash', ?, ?, ?, ?)`
      )
      .run(GLOBAL_SCOPE_HASH, now, future, now, now);

    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES ('m1', 'new memory', 'preference', '[]', NULL, 0, 0, ?, ?)`
      )
      .run(now, now);
    db.db
      .prepare(
        `INSERT INTO memory_projects (memory_id, project_id) VALUES ('m1', '00000000-0000-0000-0000-000000000000')`
      )
      .run();

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === GLOBAL_SCOPE_HASH);

    expect(globalScope?.reason).toBe("dirty");
  });

  it("initializeAndGetDirtyScopes() clears stale in-flight, expires stale rows, and returns dirty scopes atomically", () => {
    insertProject(db, EXPIRED_SCOPE);

    const staleInFlight = new Date(Date.now() - 120_000 - 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const veryPast = new Date(Date.now() - 2000).toISOString();

    // Stale in-flight + already expired: clearStaleInFlight clears it, expireStale removes it
    db.db
      .prepare(
        `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, in_flight_since, created_at, updated_at)
         VALUES ('s1', ?, 'old', 'h1', ?, ?, ?, ?, ?)`
      )
      .run(EXPIRED_SCOPE, veryPast, pastExpiry, staleInFlight, veryPast, veryPast);

    const dirty = repo.initializeAndGetDirtyScopes(120_000);

    // EXPIRED_SCOPE had an expired synthesis — returned as dirty before the row was deleted
    const scopeNames = dirty.map((d) => d.scope);
    expect(scopeNames).toContain(EXPIRED_SCOPE);

    // expireStale() removed the expired row entirely
    const expiredRow = db.db
      .prepare<[string], { id: string }>("SELECT id FROM syntheses WHERE scope = ?")
      .get(EXPIRED_SCOPE);
    expect(expiredRow).toBeUndefined();
  });

  it("markInFlight() / clearInFlight() toggle in_flight_since", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "content", "hash");

    repo.markInFlight(GLOBAL_SCOPE_HASH);
    const inFlight = repo.getSynthesis(GLOBAL_SCOPE_HASH);
    expect(inFlight?.inFlightSince).toBeTruthy();

    repo.clearInFlight(GLOBAL_SCOPE_HASH);
    const cleared = repo.getSynthesis(GLOBAL_SCOPE_HASH);
    expect(cleared?.inFlightSince).toBeNull();
  });
});
