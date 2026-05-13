import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "./manager.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `membank-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });

  vi.spyOn(ConfigManager, "getConfigPath").mockReturnValue(join(tmpDir, "config.json"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConfigManager.load()", () => {
  it("returns empty object when config file is absent", () => {
    expect(ConfigManager.load()).toEqual({});
  });

  it("parses valid JSON correctly", () => {
    writeFileSync(
      join(tmpDir, "config.json"),
      JSON.stringify({ synthesis: { enabled: true, maxTokensPerRun: 2000 } })
    );
    expect(ConfigManager.load()).toEqual({
      synthesis: { enabled: true, maxTokensPerRun: 2000 },
    });
  });

  it("returns empty object on invalid JSON without throwing", () => {
    writeFileSync(join(tmpDir, "config.json"), "not-valid-json{{{");
    expect(() => ConfigManager.load()).not.toThrow();
    expect(ConfigManager.load()).toEqual({});
  });
});

describe("ConfigManager.get() and set()", () => {
  it("set() and get() with dot-notation key updates in-memory and persisted value", () => {
    ConfigManager.set("synthesis.enabled", true);
    expect(ConfigManager.get("synthesis.enabled")).toBe(true);
  });

  it("get() returns undefined for missing key", () => {
    expect(ConfigManager.get("synthesis.enabled")).toBeUndefined();
  });

  it("set() creates nested objects as needed", () => {
    ConfigManager.set("synthesis.debounceMs", 45000);
    expect(ConfigManager.get("synthesis.debounceMs")).toBe(45000);
  });
});

describe("ConfigManager.write()", () => {
  it("persists config to file and can be re-read by load()", () => {
    const config = { synthesis: { enabled: false, stalenessDays: 30 } };
    ConfigManager.write(config);
    expect(ConfigManager.load()).toEqual(config);
  });
});

describe("ConfigManager.getConfigPath()", () => {
  it("contains .membank/config.json", () => {
    vi.restoreAllMocks();
    expect(ConfigManager.getConfigPath()).toContain(join(".membank", "config.json"));
  });
});
