import { describe, expect, it } from "vitest";
import type { Memory, SessionContext } from "../../schemas.js";
import { renderSessionContext } from "./render-session-context.js";

function pinned(content: string, type: Memory["type"]): Memory {
  return {
    id: content,
    content,
    type,
    tags: [],
    projects: [],
    primaryScopeHash: "0000000000000000",
    sourceHarness: null,
    accessCount: 0,
    pinned: true,
    reviewEvents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("renderSessionContext", () => {
  it("renders pinned memories, a synthesis section, and a verbatim section", () => {
    const ctx: SessionContext = {
      stats: { correction: 0, preference: 0, decision: 0, learning: 0, fact: 0 },
      pinnedGlobal: [pinned("global pin", "preference")],
      pinnedProject: [pinned("project pin", "decision")],
      sections: [
        { kind: "synthesis", memoryType: "correction", content: "correction summary" },
        { kind: "verbatim", memoryType: "fact", memories: ["fact one", "fact <two>"] },
      ],
    };

    expect(renderSessionContext(ctx)).toBe(
      [
        "<pinned-memories>",
        '  <memory type="preference">global pin</memory>',
        '  <memory type="decision">project pin</memory>',
        "</pinned-memories>",
        '<synthesis type="correction">',
        "correction summary",
        "</synthesis>",
        '<memories type="fact">',
        "  <memory>fact one</memory>",
        "  <memory>fact &lt;two&gt;</memory>",
        "</memories>",
      ].join("\n")
    );
  });
});
