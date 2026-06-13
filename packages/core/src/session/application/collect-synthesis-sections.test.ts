import { describe, expect, it, vi } from "vitest";
import type { MemoryType, Synthesis } from "../../schemas.js";
import type { SynthesisRepository } from "../../synthesis/index.js";
import { collectSynthesisSections } from "./collect-synthesis-sections.js";

const THRESHOLD_WORDS = 5;

function synthesis(
  scope: string,
  memoryType: MemoryType,
  overrides: Partial<Synthesis>
): Synthesis {
  return {
    id: `${scope}-${memoryType}`,
    scope,
    memoryType,
    content: "synthesized",
    sourceMemoryHash: "hash",
    synthesizedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
    inFlightSince: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type ScopeTypeKey = `${string}::${MemoryType}`;

function key(scope: string, memoryType: MemoryType): ScopeTypeKey {
  return `${scope}::${memoryType}`;
}

function makeFakeRepo(opts: {
  memories?: Partial<Record<ScopeTypeKey, string[]>>;
  syntheses?: Partial<Record<ScopeTypeKey, Synthesis>>;
}): SynthesisRepository {
  const memories = opts.memories ?? {};
  const syntheses = opts.syntheses ?? {};
  return {
    saveSynthesis: vi.fn(),
    getSynthesis: (scope, memoryType) => syntheses[key(scope, memoryType)],
    listAll: vi.fn(() => []),
    listVersions: vi.fn(() => []),
    getVersion: vi.fn(),
    markInFlight: vi.fn(),
    clearInFlight: vi.fn(),
    clearStaleInFlight: vi.fn(),
    nonPinnedMemoryContents: (scope, memoryType) => memories[key(scope, memoryType)] ?? [],
    sourceMemoryHash: vi.fn(() => "hash"),
    getExpiredOrDirtyScopes: vi.fn(() => []),
    getAllActiveScopes: vi.fn(() => []),
    expireStale: vi.fn(),
    initializeAndGetDirtyScopes: vi.fn(() => []),
  };
}

describe("collectSynthesisSections", () => {
  it("emits verbatim when a scope is below the synthesis threshold", () => {
    const repo = makeFakeRepo({ memories: { "s::fact": ["one two three"] } });

    const sections = collectSynthesisSections(repo, ["s"], THRESHOLD_WORDS);

    expect(sections).toEqual([
      { kind: "verbatim", memoryType: "fact", memories: ["one two three"] },
    ]);
  });

  it("emits synthesis when above threshold with a settled synthesis", () => {
    const repo = makeFakeRepo({
      memories: { "s::fact": ["one two three four five six"] },
      syntheses: { "s::fact": synthesis("s", "fact", { content: "summary", inFlightSince: null }) },
    });

    const sections = collectSynthesisSections(repo, ["s"], THRESHOLD_WORDS);

    expect(sections).toEqual([{ kind: "synthesis", memoryType: "fact", content: "summary" }]);
  });

  it("falls back to verbatim when above threshold but the synthesis is in flight", () => {
    const repo = makeFakeRepo({
      memories: { "s::fact": ["one two three four five six"] },
      syntheses: {
        "s::fact": synthesis("s", "fact", {
          content: "stale summary",
          inFlightSince: "2026-01-01T00:00:00.000Z",
        }),
      },
    });

    const sections = collectSynthesisSections(repo, ["s"], THRESHOLD_WORDS);

    expect(sections).toEqual([
      { kind: "verbatim", memoryType: "fact", memories: ["one two three four five six"] },
    ]);
  });

  it("skips scopes with no memories", () => {
    const repo = makeFakeRepo({});

    const sections = collectSynthesisSections(repo, ["s"], THRESHOLD_WORDS);

    expect(sections).toEqual([]);
  });

  it("produces one input per contributing scope for the same type", () => {
    const repo = makeFakeRepo({
      memories: {
        "project::fact": ["project memory"],
        "global::fact": ["global memory"],
      },
    });

    const sections = collectSynthesisSections(repo, ["project", "global"], THRESHOLD_WORDS);

    expect(sections).toEqual([
      { kind: "verbatim", memoryType: "fact", memories: ["project memory"] },
      { kind: "verbatim", memoryType: "fact", memories: ["global memory"] },
    ]);
  });
});
