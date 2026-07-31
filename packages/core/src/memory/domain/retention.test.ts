import { describe, expect, it } from "vitest";
import type { Durability, Memory, MemoryType } from "../../schemas.js";
import { computeRetention, idlePenalty, isLowRetention, RETENTION_FLOOR } from "./retention.js";

const NOW = new Date("2026-07-31T00:00:00.000Z").getTime();

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    content: "c",
    type: "learning" as MemoryType,
    tags: [],
    projects: [],
    primaryScopeHash: "0000000000000000",
    sourceHarness: null,
    accessCount: 0,
    corroborationCount: 0,
    durability: null,
    pinned: false,
    reviewEvents: [],
    createdAt: daysAgo(400),
    updatedAt: daysAgo(400),
    ...overrides,
  };
}

describe("idlePenalty", () => {
  it("never penalises a permanent memory", () => {
    expect(idlePenalty(10_000, "permanent")).toBe(0);
  });

  it("ramps to a full penalty over the durability's window", () => {
    expect(idlePenalty(0, "stable")).toBe(0);
    expect(idlePenalty(90, "stable")).toBeCloseTo(0.5);
    expect(idlePenalty(180, "stable")).toBe(1);
    expect(idlePenalty(1_000, "stable")).toBe(1);
  });

  it("ramps a volatile memory faster than a stable one", () => {
    expect(idlePenalty(30, "volatile")).toBeGreaterThan(idlePenalty(30, "stable"));
  });

  it("treats unclassified memories as stable rather than guessing", () => {
    expect(idlePenalty(90, null)).toBe(idlePenalty(90, "stable"));
  });
});

describe("computeRetention", () => {
  it("ranks a used, corroborated correction above an idle, untouched learning", () => {
    const kept = memory({
      type: "correction",
      accessCount: 12,
      corroborationCount: 3,
      updatedAt: daysAgo(5),
    });
    const idle = memory({ type: "learning", updatedAt: daysAgo(400) });

    expect(computeRetention(kept, NOW)).toBeGreaterThan(computeRetention(idle, NOW));
  });

  it("credits re-affirmation independently of retrieval", () => {
    const bare = memory();
    const corroborated = memory({ corroborationCount: 3 });

    expect(computeRetention(corroborated, NOW)).toBeGreaterThan(computeRetention(bare, NOW));
  });

  it("keeps a permanent memory above the floor no matter how long it sits idle", () => {
    const durabilities: Durability[] = ["permanent"];
    for (const durability of durabilities) {
      const m = memory({ type: "correction", durability, updatedAt: daysAgo(10_000) });
      expect(computeRetention(m, NOW)).toBeGreaterThanOrEqual(RETENTION_FLOOR);
    }
  });
});

describe("isLowRetention", () => {
  it("surfaces an idle, never-retrieved learning", () => {
    expect(isLowRetention(memory({ type: "learning", updatedAt: daysAgo(400) }), NOW)).toBe(true);
  });

  it("never surfaces a pinned memory", () => {
    const pinned = memory({ type: "fact", pinned: true, updatedAt: daysAgo(10_000) });
    expect(isLowRetention(pinned, NOW)).toBe(false);
  });

  it("does not surface a frequently retrieved memory", () => {
    expect(isLowRetention(memory({ accessCount: 50, updatedAt: daysAgo(5) }), NOW)).toBe(false);
  });
});
