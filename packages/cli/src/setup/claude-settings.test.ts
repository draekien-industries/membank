import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeSettings } from "./claude-settings.js";

describe("ClaudeSettings", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "membank-settings-"));
    path = join(dir, "settings.json");
    delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  });

  it("treats an absent settings file as auto-memory enabled", () => {
    expect(new ClaudeSettings(path).autoMemoryStatus()).toBe("enabled");
  });

  it("reads an explicit false as disabled", () => {
    writeFileSync(path, JSON.stringify({ autoMemoryEnabled: false }));
    expect(new ClaudeSettings(path).autoMemoryStatus()).toBe("disabled");
  });

  it("honours the disable env var over the file", () => {
    writeFileSync(path, JSON.stringify({ autoMemoryEnabled: true }));
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    expect(new ClaudeSettings(path).autoMemoryStatus()).toBe("disabled");
  });

  it("preserves unknown keys and their order when disabling", () => {
    writeFileSync(path, JSON.stringify({ zebra: 1, env: { TOKEN: "secret" } }, null, 2));

    new ClaudeSettings(path).disableAutoMemory();

    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      zebra: 1,
      env: { TOKEN: "secret" },
      autoMemoryEnabled: false,
    });
    expect(Object.keys(JSON.parse(readFileSync(path, "utf-8")))).toEqual([
      "zebra",
      "env",
      "autoMemoryEnabled",
    ]);
  });

  it("creates the file when absent", () => {
    new ClaudeSettings(path).disableAutoMemory();
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ autoMemoryEnabled: false });
  });

  it("refuses to overwrite a malformed settings file", () => {
    writeFileSync(path, "{ not json");
    expect(() => new ClaudeSettings(path).disableAutoMemory()).toThrow(/not valid JSON/);
    expect(readFileSync(path, "utf-8")).toBe("{ not json");
  });
});
