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

    const row = db.db
      .prepare<[], { content: string; rejected_clause: string; smells: string }>(
        "SELECT content, rejected_clause, smells FROM rejected_candidates"
      )
      .get();

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
});
