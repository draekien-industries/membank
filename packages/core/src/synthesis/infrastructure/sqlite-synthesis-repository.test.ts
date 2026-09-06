import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { MemoryType } from "../../schemas.js";
import { countRows, seedMemory, seedProject, seedSynthesis } from "../../test-support/index.js";
import type { SynthesisRepository } from "../ports.js";
import { createSynthesisRepository } from "./sqlite-synthesis-repository.js";

const EXPIRED_SCOPE = "aabbccddeeff0011";
const FRESH_SCOPE = "1100ffeeddccbbaa";

function insertProject(db: DatabaseManager, scopeHash: string): string {
  return seedProject(db, { id: `proj-${scopeHash}`, name: `test-${scopeHash}`, scopeHash });
}

function insertMemory(
  db: DatabaseManager,
  opts: { scope: string; type?: MemoryType; content?: string; pinned?: boolean }
): void {
  const projectId =
    opts.scope === GLOBAL_SCOPE_HASH ? GLOBAL_PROJECT_ID : insertProject(db, opts.scope);
  seedMemory(db, {
    id: `mem-${Math.random().toString(36).slice(2)}`,
    content: opts.content ?? "a memory",
    type: opts.type ?? "preference",
    pinned: opts.pinned,
    projectId,
  });
}

describe("SqliteSynthesisRepository", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
  });

  it("saveSynthesis() writes to DB and returns a Synthesis", () => {
    const result = repo.saveSynthesis(
      GLOBAL_SCOPE_HASH,
      "preference",
      "This is a synthesis.",
      "abc123"
    );

    expect(result.scope).toBe(GLOBAL_SCOPE_HASH);
    expect(result.content).toBe("This is a synthesis.");
    expect(result.sourceMemoryHash).toBe("abc123");
    expect(result.inFlightSince).toBeNull();
    expect(result.id).toBeTruthy();
    expect(result.synthesizedAt).toBeTruthy();
    expect(result.expiresAt > result.synthesizedAt).toBe(true);
  });

  it("saveSynthesis() updates existing synthesis for same (scope, type)", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "first", "hash1");
    const updated = repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "second", "hash2");

    expect(updated.content).toBe("second");
    expect(updated.sourceMemoryHash).toBe("hash2");

    expect(countRows(db, "syntheses")).toBe(1);
  });

  it("saveSynthesis() keeps one row per (scope, MemoryType) within a scope", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "correction", "c", "h1");
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "p", "h2");
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "p-updated", "h3");

    const rows = db.query<{ memory_type: MemoryType; content: string }>(
      "SELECT memory_type, content FROM syntheses WHERE scope = ? ORDER BY memory_type",
      GLOBAL_SCOPE_HASH
    );

    expect(rows).toEqual([
      { memory_type: "correction", content: "c" },
      { memory_type: "preference", content: "p-updated" },
    ]);
  });

  it("getSynthesis() isolates content by MemoryType within the same scope", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "correction", "correction synthesis", "h1");
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "fact", "fact synthesis", "h2");

    expect(repo.getSynthesis(GLOBAL_SCOPE_HASH, "correction")?.content).toBe(
      "correction synthesis"
    );
    expect(repo.getSynthesis(GLOBAL_SCOPE_HASH, "fact")?.content).toBe("fact synthesis");
    expect(repo.getSynthesis(GLOBAL_SCOPE_HASH, "preference")).toBeUndefined();
  });

  it("getSynthesis() returns the saved memoryType", () => {
    const saved = repo.saveSynthesis(GLOBAL_SCOPE_HASH, "decision", "content", "hash");
    expect(saved.memoryType).toBe("decision");
    expect(repo.getSynthesis(GLOBAL_SCOPE_HASH, "decision")?.memoryType).toBe("decision");
  });

  it("getSynthesis() returns synthesis for known scope", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "content", "hash");
    const result = repo.getSynthesis(GLOBAL_SCOPE_HASH, "preference");

    expect(result).toBeDefined();
    expect(result?.scope).toBe(GLOBAL_SCOPE_HASH);
    expect(result?.content).toBe("content");
  });

  it("getSynthesis() returns undefined for unknown scope", () => {
    const result = repo.getSynthesis("ccccddddeeee0000", "preference");
    expect(result).toBeUndefined();
  });

  it("sourceMemoryHash() returns consistent hash for same data", () => {
    const hash1 = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH, "preference");
    const hash2 = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH, "preference");
    expect(hash1).toBe(hash2);
  });

  it("sourceMemoryHash() returns different hash when memories differ", () => {
    const hashEmpty = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH, "preference");

    seedMemory(db, {
      id: "m1",
      content: "some memory",
      type: "preference",
      projectId: GLOBAL_PROJECT_ID,
    });

    const hashWithMemory = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH, "preference");
    expect(hashWithMemory).not.toBe(hashEmpty);
  });

  it("expireStale() deletes rows where expires_at < now", () => {
    insertProject(db, EXPIRED_SCOPE);
    insertProject(db, FRESH_SCOPE);

    const veryPast = new Date(Date.now() - 2000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const now = new Date().toISOString();

    seedSynthesis(db, {
      id: "s1",
      scope: EXPIRED_SCOPE,
      content: "old",
      sourceMemoryHash: "h1",
      synthesizedAt: veryPast,
      expiresAt: pastExpiry,
      createdAt: veryPast,
      updatedAt: now,
    });

    seedSynthesis(db, {
      id: "s2",
      scope: FRESH_SCOPE,
      content: "new",
      sourceMemoryHash: "h2",
      synthesizedAt: now,
      expiresAt: futureExpiry,
      createdAt: now,
      updatedAt: now,
    });

    repo.expireStale();

    const remaining = db
      .query<{ scope: string }>("SELECT scope FROM syntheses")
      .map((r) => r.scope);

    expect(remaining).not.toContain(EXPIRED_SCOPE);
    expect(remaining).toContain(FRESH_SCOPE);
  });

  it("getExpiredOrDirtyScopes() returns missing per (scope, type) that has memories but no synthesis", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    insertMemory(db, { scope: "abcdef0123456789", type: "correction" });

    const scopes = repo.getExpiredOrDirtyScopes();

    expect(scopes).toContainEqual({
      scope: GLOBAL_SCOPE_HASH,
      memoryType: "preference",
      reason: "missing",
    });
    expect(scopes).toContainEqual({
      scope: "abcdef0123456789",
      memoryType: "correction",
      reason: "missing",
    });
    expect(scopes.every((s) => s.reason === "missing")).toBe(true);
  });

  it("getExpiredOrDirtyScopes() does not report a (scope, type) pair that has no memories", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });

    const scopes = repo.getExpiredOrDirtyScopes();
    const types = scopes.filter((s) => s.scope === GLOBAL_SCOPE_HASH).map((s) => s.memoryType);

    expect(types).toEqual(["preference"]);
  });

  it("getExpiredOrDirtyScopes() emits a DirtyScope per non-empty type in a scope", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "correction" });

    const scopes = repo.getExpiredOrDirtyScopes();
    const types = scopes
      .filter((s) => s.scope === GLOBAL_SCOPE_HASH)
      .map((s) => s.memoryType)
      .sort();

    expect(types).toEqual(["correction", "preference"]);
  });

  it("getExpiredOrDirtyScopes() returns expired for syntheses past their TTL", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference" });
    const veryPast = new Date(Date.now() - 2000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    const now = new Date().toISOString();

    const hash = repo.sourceMemoryHash(GLOBAL_SCOPE_HASH, "preference");
    seedSynthesis(db, {
      id: "s1",
      scope: GLOBAL_SCOPE_HASH,
      content: "content",
      sourceMemoryHash: hash,
      synthesizedAt: veryPast,
      expiresAt: past,
      createdAt: veryPast,
      updatedAt: now,
    });

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === GLOBAL_SCOPE_HASH);

    expect(globalScope?.reason).toBe("expired");
  });

  it("getExpiredOrDirtyScopes() returns dirty when source hash diverges", () => {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    seedSynthesis(db, {
      id: "s1",
      scope: GLOBAL_SCOPE_HASH,
      content: "content",
      sourceMemoryHash: "stale-hash",
      synthesizedAt: now,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    });

    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: "new memory" });

    const scopes = repo.getExpiredOrDirtyScopes();
    const globalScope = scopes.find((s) => s.scope === GLOBAL_SCOPE_HASH);

    expect(globalScope?.reason).toBe("dirty");
  });

  it("nonPinnedMemoryContents() excludes pinned memories", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: "visible" });
    insertMemory(db, {
      scope: GLOBAL_SCOPE_HASH,
      type: "preference",
      content: "hidden",
      pinned: true,
    });

    const contents = repo.nonPinnedMemoryContents(GLOBAL_SCOPE_HASH, "preference");

    expect(contents).toEqual(["visible"]);
  });

  it("nonPinnedMemoryContents() returns only the requested MemoryType", () => {
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "preference", content: "pref" });
    insertMemory(db, { scope: GLOBAL_SCOPE_HASH, type: "correction", content: "corr" });

    expect(repo.nonPinnedMemoryContents(GLOBAL_SCOPE_HASH, "preference")).toEqual(["pref"]);
    expect(repo.nonPinnedMemoryContents(GLOBAL_SCOPE_HASH, "correction")).toEqual(["corr"]);
  });

  it("initializeAndGetDirtyScopes() clears stale in-flight, expires stale rows, and returns dirty scopes atomically", () => {
    insertMemory(db, { scope: EXPIRED_SCOPE, type: "preference" });

    const staleInFlight = new Date(Date.now() - 120_000 - 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const veryPast = new Date(Date.now() - 2000).toISOString();

    // Stale in-flight + already expired: clearStaleInFlight clears it, expireStale removes it
    seedSynthesis(db, {
      id: "s1",
      scope: EXPIRED_SCOPE,
      content: "old",
      sourceMemoryHash: "h1",
      synthesizedAt: veryPast,
      expiresAt: pastExpiry,
      inFlightSince: staleInFlight,
      createdAt: veryPast,
      updatedAt: veryPast,
    });

    const dirty = repo.initializeAndGetDirtyScopes(120_000);

    // EXPIRED_SCOPE had an expired synthesis — returned as dirty before the row was deleted
    const scopeNames = dirty.map((d) => d.scope);
    expect(scopeNames).toContain(EXPIRED_SCOPE);

    // expireStale() removed the expired row entirely
    const expiredRow = db.one<{ id: string }>(
      "SELECT id FROM syntheses WHERE scope = ?",
      EXPIRED_SCOPE
    );
    expect(expiredRow).toBeUndefined();
  });

  it("markInFlight() / clearInFlight() toggle in_flight_since", () => {
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "content", "hash");

    repo.markInFlight(GLOBAL_SCOPE_HASH, "preference");
    const inFlight = repo.getSynthesis(GLOBAL_SCOPE_HASH, "preference");
    expect(inFlight?.inFlightSince).toBeTruthy();

    repo.clearInFlight(GLOBAL_SCOPE_HASH, "preference");
    const cleared = repo.getSynthesis(GLOBAL_SCOPE_HASH, "preference");
    expect(cleared?.inFlightSince).toBeNull();
  });
});
