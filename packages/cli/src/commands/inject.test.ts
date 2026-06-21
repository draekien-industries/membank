import { describe, expect, it, vi } from "vitest";
import { deriveCapabilityKey, MEMORY_GUIDANCE } from "./inject.js";

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
        sections: [],
      }),
    })),
    createSynthesisRepository: vi.fn().mockReturnValue({
      getSynthesis: vi.fn().mockReturnValue(undefined),
      nonPinnedMemoryContents: vi.fn().mockReturnValue([]),
    }),
  };
});

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

describe("injectCommand — legacy event values", () => {
  it.each(["session-stop", "stop"])("treats legacy --event %s as a no-op", async (event) => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("exit");
    }) as never);
    const { injectCommand } = await import("./inject.js");
    const output = await captureStdout(async () => {
      try {
        await injectCommand({ event });
      } catch {
        // process.exit is mocked to throw — swallow
      }
    });
    expect(output).toBe("");
    exitSpy.mockRestore();
  });
});

describe("injectCommand — claude-code user-prompt-submit no-op", () => {
  it("exits silently when harness=claude-code and event=user-prompt-submit", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("exit");
    }) as never);
    const { injectCommand } = await import("./inject.js");
    const output = await captureStdout(async () => {
      try {
        await injectCommand({ harness: "claude-code", event: "user-prompt-submit" });
      } catch {
        // process.exit is mocked to throw — swallow
      }
    });
    expect(output).toBe("");
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});

describe("deriveCapabilityKey", () => {
  it("maps a Skill invocation to skill:<name> from tool_input.skill", () => {
    const key = deriveCapabilityKey("Skill", { skill: "shadcn" });
    expect(key?.toString()).toBe("skill:shadcn");
  });

  it("maps any other tool to tool:<name> from tool_name", () => {
    expect(deriveCapabilityKey("Bash", { command: "ls" })?.toString()).toBe("tool:Bash");
    expect(deriveCapabilityKey("mcp__memory__save", {})?.toString()).toBe("tool:mcp__memory__save");
  });

  it("returns null when tool_name is missing or empty", () => {
    expect(deriveCapabilityKey(undefined, {})).toBeNull();
    expect(deriveCapabilityKey("", {})).toBeNull();
    expect(deriveCapabilityKey(123, {})).toBeNull();
  });

  it("returns null when a Skill invocation has no usable skill field", () => {
    expect(deriveCapabilityKey("Skill", {})).toBeNull();
    expect(deriveCapabilityKey("Skill", { skill: "" })).toBeNull();
    expect(deriveCapabilityKey("Skill", { skill: "   " })).toBeNull();
    expect(deriveCapabilityKey("Skill", null)).toBeNull();
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
