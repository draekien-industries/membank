import { describe, expect, it, vi } from "vitest";
import type {
  PromotedMemoryWriter,
  RejectedCandidateRecord,
  RejectedCandidateRepository,
} from "../ports.js";
import { promoteRejectedCandidate } from "./promote-rejected-candidate.js";

function record(overrides: Partial<RejectedCandidateRecord> = {}): RejectedCandidateRecord {
  return {
    id: "cand-1",
    content: "Unobserved DiagnosticListener emission allocates zero bytes",
    type: "learning",
    durability: "stable",
    derivability: "costly",
    actionability: "context",
    evidenceQuote: "the user said so",
    rejectedClause: "inert",
    smells: [],
    sessionId: "sess-1",
    projectHash: "0123456789abcdef",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeRejections(
  stored: RejectedCandidateRecord | undefined
): RejectedCandidateRepository & {
  removed: string[];
} {
  return {
    removed: [],
    record: () => {},
    prune: () => 0,
    countByClause: () => [],
    list: () => (stored === undefined ? [] : [stored]),
    get: (id) => (stored !== undefined && stored.id === id ? stored : undefined),
    remove(id) {
      this.removed.push(id);
      return true;
    },
  };
}

describe("promoteRejectedCandidate", () => {
  it("saves the candidate and spends the row", async () => {
    const rejections = fakeRejections(record());
    const memories: PromotedMemoryWriter = { save: vi.fn().mockResolvedValue({ id: "mem-9" }) };

    const result = await promoteRejectedCandidate("cand-1", { rejections, memories });

    expect(result).toEqual({
      status: "promoted",
      memoryId: "mem-9",
      content: "Unobserved DiagnosticListener emission allocates zero bytes",
    });
    expect(memories.save).toHaveBeenCalledWith({
      content: "Unobserved DiagnosticListener emission allocates zero bytes",
      type: "learning",
      durability: "stable",
      projectHash: "0123456789abcdef",
    });
    expect(rejections.removed).toEqual(["cand-1"]);
  });

  it("reports not_found for an id pruned or promoted since it was listed", async () => {
    const rejections = fakeRejections(undefined);
    const memories: PromotedMemoryWriter = { save: vi.fn() };

    const result = await promoteRejectedCandidate("gone", { rejections, memories });

    expect(result).toEqual({ status: "not_found" });
    expect(memories.save).not.toHaveBeenCalled();
    expect(rejections.removed).toEqual([]);
  });

  it("promotes without re-running the gate, so a clause that rejected it does not block it", async () => {
    const rejections = fakeRejections(record({ rejectedClause: "trivially-derivable" }));
    const memories: PromotedMemoryWriter = { save: vi.fn().mockResolvedValue({ id: "mem-3" }) };

    const result = await promoteRejectedCandidate("cand-1", { rejections, memories });

    expect(result.status).toBe("promoted");
  });

  it("spends the row even when the writer absorbed the content into an existing memory", async () => {
    const rejections = fakeRejections(record());
    const memories: PromotedMemoryWriter = {
      save: vi.fn().mockResolvedValue({ id: "pre-existing" }),
    };

    const result = await promoteRejectedCandidate("cand-1", { rejections, memories });

    expect(result).toMatchObject({ status: "promoted", memoryId: "pre-existing" });
    expect(rejections.removed).toEqual(["cand-1"]);
  });
});
