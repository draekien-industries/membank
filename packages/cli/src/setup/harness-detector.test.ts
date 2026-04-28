import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectHarnesses } from "./harness-detector.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "harness-detector-"));
}

function touch(filePath: string): void {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, "{}");
}

describe("detectHarnesses", () => {
  it("detects claude-code when ~/.claude.json exists", () => {
    const home = makeTempDir();
    touch(join(home, ".claude.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("claude-code");
    expect(results[0]?.configPath).toBe(join(home, ".claude.json"));
  });

  it("detects claude-code via legacy ~/.claude/settings.json fallback", () => {
    const home = makeTempDir();
    touch(join(home, ".claude", "settings.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("claude-code");
    // configPath always points to the canonical location, not the legacy fallback
    expect(results[0]?.configPath).toBe(join(home, ".claude.json"));
  });

  it("detects copilot when ~/.copilot/mcp-config.json exists", () => {
    const home = makeTempDir();
    touch(join(home, ".copilot", "mcp-config.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("copilot");
    expect(results[0]?.configPath).toBe(join(home, ".copilot", "mcp-config.json"));
  });

  it("detects codex when ~/.codex/config.toml exists", () => {
    const home = makeTempDir();
    touch(join(home, ".codex", "config.toml"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("codex");
    expect(results[0]?.configPath).toBe(join(home, ".codex", "config.toml"));
  });

  it("detects codex via legacy ~/.codex/config.json fallback", () => {
    const home = makeTempDir();
    touch(join(home, ".codex", "config.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("codex");
    expect(results[0]?.configPath).toBe(join(home, ".codex", "config.toml"));
  });

  it("detects opencode when ~/.config/opencode/opencode.json exists", () => {
    const home = makeTempDir();
    touch(join(home, ".config", "opencode", "opencode.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("opencode");
    expect(results[0]?.configPath).toBe(join(home, ".config", "opencode", "opencode.json"));
  });

  it("detects opencode via legacy ~/.config/opencode/config.json fallback", () => {
    const home = makeTempDir();
    touch(join(home, ".config", "opencode", "config.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("opencode");
    expect(results[0]?.configPath).toBe(join(home, ".config", "opencode", "opencode.json"));
  });

  it("returns empty array when no harness config files exist", () => {
    const home = makeTempDir();

    const results = detectHarnesses({ homeDir: () => home });

    expect(results).toEqual([]);
  });

  it("detects all 4 harnesses when all config files exist", () => {
    const home = makeTempDir();
    touch(join(home, ".claude.json"));
    touch(join(home, ".copilot", "mcp-config.json"));
    touch(join(home, ".codex", "config.toml"));
    touch(join(home, ".config", "opencode", "opencode.json"));

    const results = detectHarnesses({ homeDir: () => home });

    const names = results.map((r) => r.name);
    expect(names).toContain("claude-code");
    expect(names).toContain("copilot");
    expect(names).toContain("codex");
    expect(names).toContain("opencode");
    expect(results).toHaveLength(4);
  });

  it("detects only present harnesses when a subset of configs exist", () => {
    const home = makeTempDir();
    touch(join(home, ".claude.json"));
    touch(join(home, ".codex", "config.toml"));

    const results = detectHarnesses({ homeDir: () => home });

    const names = results.map((r) => r.name);
    expect(names).toContain("claude-code");
    expect(names).toContain("codex");
    expect(names).not.toContain("copilot");
    expect(names).not.toContain("opencode");
    expect(results).toHaveLength(2);
  });

  it("each result includes the resolved absolute configPath", () => {
    const home = makeTempDir();
    touch(join(home, ".claude.json"));

    const results = detectHarnesses({ homeDir: () => home });

    expect(results[0]?.configPath).toMatch(/\.claude\.json$/);
    expect(results[0]?.configPath.startsWith(home)).toBe(true);
  });
});
