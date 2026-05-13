import { describe, expect, it, vi } from "vitest";
import { MEMORY_GUIDANCE } from "./inject.js";

vi.mock("@membank/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@membank/core")>();
  return {
    ...actual,
    resolveProject: vi.fn().mockResolvedValue({ hash: "test-hash" }),
    DatabaseManager: {
      open: vi.fn().mockReturnValue({ close: vi.fn() }),
    },
    SessionContextBuilder: vi.fn().mockImplementation(() => ({
      getSessionContext: vi.fn().mockReturnValue({
        stats: {},
        pinnedGlobal: [],
        pinnedProject: [],
      }),
    })),
    SynthesisRepository: vi.fn().mockImplementation(() => ({
      getSynthesis: vi.fn().mockReturnValue(undefined),
    })),
  };
});

describe("injectCommand — session-stop routing", () => {
  it.each([
    "session-stop",
    "stop",
  ])("accepts --event %s and writes output without error", async (event) => {
    const { injectCommand } = await import("./inject.js");
    const written: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      written.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };
    try {
      await injectCommand({ event });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(written.length).toBeGreaterThan(0);
  });
});

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
