import { describe, expect, it } from "vitest";
import { MEMORY_GUIDANCE } from "./inject.js";

describe("MEMORY_GUIDANCE", () => {
  it("is a non-empty string", () => {
    expect(typeof MEMORY_GUIDANCE).toBe("string");
    expect(MEMORY_GUIDANCE.length).toBeGreaterThan(0);
  });

  it("starts with the [Memory Guidance]: marker", () => {
    expect(MEMORY_GUIDANCE.startsWith("[Memory Guidance]:")).toBe(true);
  });

  it("references each MCP tool name", () => {
    expect(MEMORY_GUIDANCE).toContain("query_memory");
    expect(MEMORY_GUIDANCE).toContain("save_memory");
    expect(MEMORY_GUIDANCE).toContain("update_memory");
    expect(MEMORY_GUIDANCE).toContain("delete_memory");
  });

  it("names each memory type", () => {
    expect(MEMORY_GUIDANCE).toContain("correction");
    expect(MEMORY_GUIDANCE).toContain("preference");
    expect(MEMORY_GUIDANCE).toContain("decision");
    expect(MEMORY_GUIDANCE).toContain("learning");
  });
});
