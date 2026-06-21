import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CapabilityKey } from "../../capability/domain/capability-key.js";
import type { CapabilityRepository } from "../../capability/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { Memory } from "../../schemas.js";
import { getCapabilityContext } from "./get-capability-context.js";

function makeMemory(content: string): Memory {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    content,
    type: "learning",
    tags: [],
    projects: [],
    primaryScopeHash: GLOBAL_SCOPE_HASH,
    sourceHarness: null,
    accessCount: 0,
    pinned: false,
    reviewEvents: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeCapabilities(memories: Memory[]): CapabilityRepository {
  return {
    upsertByKey: () => {
      throw new Error("not used");
    },
    findByKey: () => null,
    listByKind: () => [],
    associate: () => {},
    allMemoriesForCapability: () => memories,
  };
}

describe("getCapabilityContext", () => {
  it("returns null when the capability has no memories", () => {
    const ctx = getCapabilityContext(
      { key: CapabilityKey.forTool("Bash") },
      { capabilities: makeCapabilities([]) }
    );
    expect(ctx).toBeNull();
  });

  it("returns memories and a rendered block when memories exist", () => {
    const memories = [makeMemory("Always pass -e to bash"), makeMemory("Quote your paths")];
    const ctx = getCapabilityContext(
      { key: CapabilityKey.forTool("Bash") },
      { capabilities: makeCapabilities(memories) }
    );

    expect(ctx).not.toBeNull();
    expect(ctx?.key).toBe("tool:Bash");
    expect(ctx?.memories).toHaveLength(2);
    expect(ctx?.rendered).toContain('<capability-memories key="tool:Bash">');
    expect(ctx?.rendered).toContain("Always pass -e to bash");
    expect(ctx?.rendered).toContain('scope "tool:Bash"');
  });
});
