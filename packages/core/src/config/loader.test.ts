import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig (via isSynthesisEnabled)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the config file does not exist (ENOENT)", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => {
        const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
        throw err;
      }),
    }));

    const { isSynthesisEnabled } = await import("./loader.js");
    expect(isSynthesisEnabled()).toBe(false);
  });

  it("rethrows when the config file contains malformed JSON", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => "{ not valid json"),
    }));

    const { isSynthesisEnabled } = await import("./loader.js");
    expect(() => isSynthesisEnabled()).toThrow(SyntaxError);
  });

  it("returns the parsed config when the file contains valid JSON", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => JSON.stringify({ synthesis: { enabled: true } })),
    }));

    const { isSynthesisEnabled } = await import("./loader.js");
    expect(isSynthesisEnabled()).toBe(true);
  });
});
