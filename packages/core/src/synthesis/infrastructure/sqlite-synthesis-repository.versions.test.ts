import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { seedProject, seedSynthesis, setSynthesisInFlight } from "../../test-support/index.js";
import type { SynthesisRepository } from "../ports.js";
import { createSynthesisRepository } from "./sqlite-synthesis-repository.js";

const MAX_VERSIONS = 5;
const SCOPE = "1111111111111111";

describe("SqliteSynthesisRepository — listAll", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
    seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  it("returns nothing before any synthesis is saved", () => {
    expect(repo.listAll()).toEqual([]);
  });

  it("maps a stored row onto the Synthesis contract", () => {
    repo.saveSynthesis(SCOPE, "preference", "prefers tabs", "hash-1");

    const [synthesis] = repo.listAll();

    expect(synthesis).toMatchObject({
      scope: SCOPE,
      memoryType: "preference",
      content: "prefers tabs",
      sourceMemoryHash: "hash-1",
      inFlightSince: null,
    });
  });

  it("returns one entry per scope and memory type", () => {
    repo.saveSynthesis(SCOPE, "preference", "a", "h");
    repo.saveSynthesis(SCOPE, "fact", "b", "h");
    repo.saveSynthesis(GLOBAL_SCOPE_HASH, "preference", "c", "h");

    expect(repo.listAll()).toHaveLength(3);
  });

  it("orders by scope then memory type, so output is stable across runs", () => {
    repo.saveSynthesis(SCOPE, "preference", "a", "h");
    repo.saveSynthesis(SCOPE, "fact", "b", "h");

    expect(repo.listAll().map((s) => s.memoryType)).toEqual(["fact", "preference"]);
  });

  it("still returns one entry after the same scope and type is re-synthesized", () => {
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");
    repo.saveSynthesis(SCOPE, "preference", "second", "h2");

    const all = repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.content).toBe("second");
  });
});

describe("SqliteSynthesisRepository — version history", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
    seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  it("records no versions for a scope that was never synthesized", () => {
    expect(repo.listVersions(SCOPE, "preference")).toEqual([]);
  });

  it("records no version for the first synthesis, which replaced nothing", () => {
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");

    expect(repo.listVersions(SCOPE, "preference")).toEqual([]);
  });

  it("archives the superseded content when a synthesis is replaced", () => {
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");
    repo.saveSynthesis(SCOPE, "preference", "second", "h2");

    const versions = repo.listVersions(SCOPE, "preference");

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      memoryType: "preference",
      version: 1,
      content: "first",
      sourceMemoryHash: "h1",
    });
  });

  it("orders versions newest first", () => {
    repo.saveSynthesis(SCOPE, "preference", "v1", "h1");
    repo.saveSynthesis(SCOPE, "preference", "v2", "h2");
    repo.saveSynthesis(SCOPE, "preference", "v3", "h3");

    expect(repo.listVersions(SCOPE, "preference").map((v) => v.version)).toEqual([2, 1]);
    expect(repo.listVersions(SCOPE, "preference").map((v) => v.content)).toEqual(["v2", "v1"]);
  });

  it("keeps each memory type's history separate", () => {
    repo.saveSynthesis(SCOPE, "preference", "pref-1", "h");
    repo.saveSynthesis(SCOPE, "preference", "pref-2", "h");
    repo.saveSynthesis(SCOPE, "fact", "fact-1", "h");

    expect(repo.listVersions(SCOPE, "preference").map((v) => v.content)).toEqual(["pref-1"]);
    expect(repo.listVersions(SCOPE, "fact")).toEqual([]);
  });

  it("does not archive the in-flight placeholder, which never held real content", () => {
    repo.markInFlight(SCOPE, "preference");
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");

    expect(repo.listVersions(SCOPE, "preference")).toEqual([]);
  });

  it("returns the archived content for a known version", () => {
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");
    repo.saveSynthesis(SCOPE, "preference", "second", "h2");

    expect(repo.getVersion(SCOPE, "preference", 1)?.content).toBe("first");
  });

  it("returns undefined for a version that was never written", () => {
    repo.saveSynthesis(SCOPE, "preference", "first", "h1");

    expect(repo.getVersion(SCOPE, "preference", 99)).toBeUndefined();
  });

  it("returns undefined for a scope that has no synthesis at all", () => {
    expect(repo.getVersion(GLOBAL_SCOPE_HASH, "preference", 1)).toBeUndefined();
  });

  it(`retains at most ${MAX_VERSIONS} versions, dropping the oldest`, () => {
    // MAX_VERSIONS + 3 saves archive MAX_VERSIONS + 2 prior contents,
    // so the two oldest must have been pruned.
    for (let i = 1; i <= MAX_VERSIONS + 3; i++) {
      repo.saveSynthesis(SCOPE, "preference", `v${i}`, `h${i}`);
    }

    const versions = repo.listVersions(SCOPE, "preference");

    expect(versions).toHaveLength(MAX_VERSIONS);
    expect(versions.map((v) => v.content)).not.toContain("v1");
    expect(versions[0]?.content).toBe(`v${MAX_VERSIONS + 2}`);
  });
});

describe("SqliteSynthesisRepository — getAllActiveScopes", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
  });

  it("includes the global scope, which every install has", () => {
    expect(repo.getAllActiveScopes()).toContain(GLOBAL_SCOPE_HASH);
  });

  it("includes a registered project's scope hash", () => {
    seedProject(db, { scopeHash: SCOPE, name: "alpha" });

    expect(repo.getAllActiveScopes()).toContain(SCOPE);
  });

  it("reports each scope once even when several projects share the hash", () => {
    seedProject(db, { scopeHash: SCOPE, name: "alpha" });
    seedProject(db, { scopeHash: SCOPE, name: "alpha-again" });

    const scopes = repo.getAllActiveScopes();

    expect(scopes.filter((s) => s === SCOPE)).toHaveLength(1);
  });
});

describe("SqliteSynthesisRepository — clearStaleInFlight", () => {
  let db: DatabaseManager;
  let repo: SynthesisRepository;

  const ONE_HOUR_MS = 3_600_000;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    repo = createSynthesisRepository(db);
    seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  function inFlightSinceOf(scope: string): string | null | undefined {
    return db.one<{ in_flight_since: string | null }>(
      "SELECT in_flight_since FROM syntheses WHERE scope = ?",
      scope
    )?.in_flight_since;
  }

  it("releases a claim older than the threshold, so a crashed run cannot block forever", () => {
    seedSynthesis(db, { scope: SCOPE });
    setSynthesisInFlight(db, SCOPE, new Date(Date.now() - 2 * ONE_HOUR_MS).toISOString());

    repo.clearStaleInFlight(ONE_HOUR_MS);

    expect(inFlightSinceOf(SCOPE)).toBeNull();
  });

  it("leaves a claim younger than the threshold alone, since that run may still be live", () => {
    seedSynthesis(db, { scope: SCOPE });
    const recent = new Date(Date.now() - 60_000).toISOString();
    setSynthesisInFlight(db, SCOPE, recent);

    repo.clearStaleInFlight(ONE_HOUR_MS);

    expect(inFlightSinceOf(SCOPE)).toBe(recent);
  });

  it("leaves rows that hold no claim alone", () => {
    seedSynthesis(db, { scope: SCOPE, inFlightSince: null });

    repo.clearStaleInFlight(ONE_HOUR_MS);

    expect(inFlightSinceOf(SCOPE)).toBeNull();
  });

  it("clears every stale scope in one pass", () => {
    const stale = new Date(Date.now() - 2 * ONE_HOUR_MS).toISOString();
    seedSynthesis(db, { scope: SCOPE, inFlightSince: stale });
    seedSynthesis(db, { scope: GLOBAL_SCOPE_HASH, inFlightSince: stale });

    repo.clearStaleInFlight(ONE_HOUR_MS);

    expect(inFlightSinceOf(SCOPE)).toBeNull();
    expect(inFlightSinceOf(GLOBAL_SCOPE_HASH)).toBeNull();
  });
});
