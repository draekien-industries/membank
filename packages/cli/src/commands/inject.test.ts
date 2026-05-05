import { describe, expect, it } from "vitest";
import { MEMORY_GUIDANCE } from "./inject.js";

describe("MEMORY_GUIDANCE", () => {
  it("is a non-empty string", () => {
    expect(typeof MEMORY_GUIDANCE).toBe("string");
    expect(MEMORY_GUIDANCE.length).toBeGreaterThan(0);
  });

  it("references the core MCP tools", () => {
    expect(MEMORY_GUIDANCE).toContain("query_memory");
    expect(MEMORY_GUIDANCE).toContain("save_memory");
  });

  it("names each memory type", () => {
    expect(MEMORY_GUIDANCE).toContain("correction");
    expect(MEMORY_GUIDANCE).toContain("preference");
    expect(MEMORY_GUIDANCE).toContain("decision");
    expect(MEMORY_GUIDANCE).toContain("learning");
  });

  it("covers both save and query guidance", () => {
    expect(MEMORY_GUIDANCE).toContain("save_memory");
    expect(MEMORY_GUIDANCE).toContain("query_memory");
    expect(MEMORY_GUIDANCE.indexOf("save_memory")).toBeLessThan(
      MEMORY_GUIDANCE.indexOf("query_memory")
    );
  });
});
