import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import type { RejectedCandidate, RejectedCandidateRepository } from "../ports.js";
import { createRejectedCandidateRepository } from "./sqlite-rejected-candidate-repository.js";

function candidate(overrides: Partial<RejectedCandidate> = {}): RejectedCandidate {
  return {
    content: "Biome 2.x is the linter for membank",
    type: "learning",
    durability: "stable",
    derivability: "trivial",
    actionability: "context",
    evidenceQuote: "we use biome",
    rejectedClause: "trivially-derivable",
    smells: ["code-reference"],
    sessionId: "s1",
    projectHash: "0123456789abcdef",
    ...overrides,
  };
}

describe("SqliteRejectedCandidateRepository", () => {
  let db: DatabaseManager;
  let rejections: RejectedCandidateRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    rejections = createRejectedCandidateRepository(db);
  });

  it("records a rejection with its rubric, clause and smells", () => {
    rejections.record(candidate(), new Date("2026-07-01T00:00:00.000Z"));

    const row = db.one<{ content: string; rejected_clause: string; smells: string }>(
      "SELECT content, rejected_clause, smells FROM rejected_candidates"
    );

    expect(row?.rejected_clause).toBe("trivially-derivable");
    expect(JSON.parse(row?.smells ?? "[]")).toEqual(["code-reference"]);
  });

  it("counts by clause within the window, most frequent first", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    rejections.record(candidate(), now);
    rejections.record(candidate(), now);
    rejections.record(candidate({ rejectedClause: "inert" }), now);

    expect(rejections.countByClause(new Date("2026-06-01T00:00:00.000Z"))).toEqual([
      { clause: "trivially-derivable", count: 2 },
      { clause: "inert", count: 1 },
    ]);
  });

  it("excludes rejections older than the window", () => {
    rejections.record(candidate(), new Date("2026-01-01T00:00:00.000Z"));

    expect(rejections.countByClause(new Date("2026-06-01T00:00:00.000Z"))).toEqual([]);
  });

  it("prunes rejections older than the cutoff and leaves newer ones", () => {
    rejections.record(candidate(), new Date("2026-01-01T00:00:00.000Z"));
    rejections.record(candidate(), new Date("2026-07-01T00:00:00.000Z"));

    expect(rejections.prune(new Date("2026-06-01T00:00:00.000Z"))).toBe(1);
    expect(rejections.countByClause(new Date("2020-01-01T00:00:00.000Z"))).toEqual([
      { clause: "trivially-derivable", count: 1 },
    ]);
  });

  it("lists newest first and round-trips the rubric, smells and evidence", () => {
    rejections.record(candidate({ content: "older" }), new Date("2026-07-01T00:00:00.000Z"));
    rejections.record(candidate({ content: "newer" }), new Date("2026-07-02T00:00:00.000Z"));

    const listed = rejections.list();

    expect(listed.map((c) => c.content)).toEqual(["newer", "older"]);
    expect(listed[0]).toMatchObject({
      type: "learning",
      durability: "stable",
      derivability: "trivial",
      actionability: "context",
      evidenceQuote: "we use biome",
      rejectedClause: "trivially-derivable",
      smells: ["code-reference"],
      projectHash: "0123456789abcdef",
    });
  });

  it("filters by clause, project and limit", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    rejections.record(candidate({ rejectedClause: "inert" }), now);
    rejections.record(candidate({ rejectedClause: "volatile" }), now);
    rejections.record(candidate({ projectHash: "other" }), now);

    expect(rejections.list({ clause: "inert" })).toHaveLength(1);
    expect(rejections.list({ projectHash: "other" })).toHaveLength(1);
    expect(rejections.list({ limit: 2 })).toHaveLength(2);
  });

  it("gets by id and removes exactly once", () => {
    rejections.record(candidate(), new Date("2026-07-01T00:00:00.000Z"));
    const [only] = rejections.list();
    if (only === undefined) throw new Error("expected a recorded candidate");

    expect(rejections.get(only.id)?.content).toBe("Biome 2.x is the linter for membank");
    expect(rejections.remove(only.id)).toBe(true);
    expect(rejections.remove(only.id)).toBe(false);
    expect(rejections.get(only.id)).toBeUndefined();
  });
});
