import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  HarnessConfigWriter,
  type PathResolver,
  SUPPORTED_HARNESSES,
} from "./harness-config-writer.js";

// Create a fresh isolated temp directory for each test.
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "membank-test-"));
}

// Build a PathResolver that points home and cwd at a single temp directory.
function makeTmpResolver(): { resolver: PathResolver; dir: string } {
  const dir = makeTmpDir();
  return { resolver: { home: () => dir, cwd: () => dir }, dir };
}

// Read a JSON file, throwing clearly if it doesn't exist.
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

// Write arbitrary JSON to a path (creating parent dirs).
function writeJson(path: string, data: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// --- helpers to get each harness config path relative to a dir ---

function claudeCodePath(dir: string): string {
  return join(dir, ".claude", "settings.json");
}
function vscodePath(dir: string): string {
  return join(dir, ".vscode", "mcp.json");
}
function codexPath(dir: string): string {
  return join(dir, ".codex", "config.json");
}
function opencodePath(dir: string): string {
  return join(dir, ".config", "opencode", "config.json");
}

describe("HarnessConfigWriter — supported harnesses", () => {
  it("exposes all 4 expected harness names", () => {
    expect(SUPPORTED_HARNESSES).toContain("claude-code");
    expect(SUPPORTED_HARNESSES).toContain("vscode");
    expect(SUPPORTED_HARNESSES).toContain("codex");
    expect(SUPPORTED_HARNESSES).toContain("opencode");
    expect(SUPPORTED_HARNESSES).toHaveLength(4);
  });
});

describe("HarnessConfigWriter — unknown harness", () => {
  it("throws for an unrecognised harness name", () => {
    const { resolver } = makeTmpResolver();
    const writer = new HarnessConfigWriter(resolver);
    expect(() => writer.write("nonexistent")).toThrow("Unknown harness: nonexistent");
  });
});

// ---------- claude-code ----------

describe("claude-code", () => {
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new HarnessConfigWriter(tmp.resolver);
  });

  it("writes membank entry when config does not exist", () => {
    const result = writer.write("claude-code");
    expect(result.status).toBe("written");

    const cfg = readJson(claudeCodePath(dir));
    expect((cfg["mcpServers"] as Record<string, unknown>)["membank"]).toBeDefined();
  });

  it("merges membank entry without corrupting existing mcpServers keys", () => {
    const path = claudeCodePath(dir);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeJson(path, { mcpServers: { other: { command: "other-cmd", args: [] } } });

    writer.write("claude-code");

    const cfg = readJson(path);
    const servers = cfg["mcpServers"] as Record<string, unknown>;
    expect(servers["other"]).toBeDefined();
    expect(servers["membank"]).toBeDefined();
  });

  it("preserves existing top-level keys in the config", () => {
    const path = claudeCodePath(dir);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeJson(path, { existingKey: "keepMe", mcpServers: {} });

    writer.write("claude-code");

    const cfg = readJson(path);
    expect(cfg["existingKey"]).toBe("keepMe");
  });

  it("returns already-configured when membank entry already present", () => {
    const path = claudeCodePath(dir);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeJson(path, {
      mcpServers: { membank: { command: "npx", args: ["@membank/cli", "--mcp"] } },
    });

    const result = writer.write("claude-code");
    expect(result.status).toBe("already-configured");
  });

  it("overwrites when overwrite:true even if already configured", () => {
    const path = claudeCodePath(dir);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeJson(path, { mcpServers: { membank: { command: "old", args: [] } } });

    const result = writer.write("claude-code", { overwrite: true });
    expect(result.status).toBe("written");

    const cfg = readJson(path);
    const entry = (cfg["mcpServers"] as Record<string, unknown>)["membank"] as {
      command: string;
      args: string[];
    };
    expect(entry.command).toBe("npx");
  });

  it("writes atomically (file is valid JSON after write)", () => {
    writer.write("claude-code");
    expect(() => readJson(claudeCodePath(dir))).not.toThrow();
  });
});

// ---------- vscode ----------

describe("vscode", () => {
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new HarnessConfigWriter(tmp.resolver);
  });

  it("writes membank entry under servers key", () => {
    const result = writer.write("vscode");
    expect(result.status).toBe("written");

    const cfg = readJson(vscodePath(dir));
    expect((cfg["servers"] as Record<string, unknown>)["membank"]).toBeDefined();
  });

  it("merges without corrupting existing servers keys", () => {
    const path = vscodePath(dir);
    mkdirSync(join(dir, ".vscode"), { recursive: true });
    writeJson(path, { servers: { otherServer: { command: "x", args: [] } } });

    writer.write("vscode");

    const cfg = readJson(path);
    const servers = cfg["servers"] as Record<string, unknown>;
    expect(servers["otherServer"]).toBeDefined();
    expect(servers["membank"]).toBeDefined();
  });

  it("detects already-configured via servers key", () => {
    const path = vscodePath(dir);
    mkdirSync(join(dir, ".vscode"), { recursive: true });
    writeJson(path, { servers: { membank: { command: "npx", args: ["@membank/cli", "--mcp"] } } });

    expect(writer.write("vscode").status).toBe("already-configured");
  });
});

// ---------- codex ----------

describe("codex", () => {
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new HarnessConfigWriter(tmp.resolver);
  });

  it("writes membank entry under mcpServers key", () => {
    const result = writer.write("codex");
    expect(result.status).toBe("written");

    const cfg = readJson(codexPath(dir));
    expect((cfg["mcpServers"] as Record<string, unknown>)["membank"]).toBeDefined();
  });

  it("merges without corrupting existing mcpServers keys", () => {
    const path = codexPath(dir);
    mkdirSync(join(dir, ".codex"), { recursive: true });
    writeJson(path, { mcpServers: { existing: { command: "y", args: [] } } });

    writer.write("codex");

    const servers = readJson(path)["mcpServers"] as Record<string, unknown>;
    expect(servers["existing"]).toBeDefined();
    expect(servers["membank"]).toBeDefined();
  });

  it("detects already-configured via mcpServers key", () => {
    const path = codexPath(dir);
    mkdirSync(join(dir, ".codex"), { recursive: true });
    writeJson(path, { mcpServers: { membank: { command: "npx", args: [] } } });

    expect(writer.write("codex").status).toBe("already-configured");
  });
});

// ---------- opencode ----------

describe("opencode", () => {
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new HarnessConfigWriter(tmp.resolver);
  });

  it("writes membank entry under mcp key", () => {
    const result = writer.write("opencode");
    expect(result.status).toBe("written");

    const cfg = readJson(opencodePath(dir));
    expect((cfg["mcp"] as Record<string, unknown>)["membank"]).toBeDefined();
  });

  it("merges without corrupting existing mcp keys", () => {
    const path = opencodePath(dir);
    mkdirSync(join(dir, ".config", "opencode"), { recursive: true });
    writeJson(path, { mcp: { existing: { command: "z", args: [] } } });

    writer.write("opencode");

    const mcp = readJson(path)["mcp"] as Record<string, unknown>;
    expect(mcp["existing"]).toBeDefined();
    expect(mcp["membank"]).toBeDefined();
  });

  it("detects already-configured via mcp key", () => {
    const path = opencodePath(dir);
    mkdirSync(join(dir, ".config", "opencode"), { recursive: true });
    writeJson(path, { mcp: { membank: { command: "npx", args: [] } } });

    expect(writer.write("opencode").status).toBe("already-configured");
  });
});

// ---------- membank entry shape ----------

describe("membank entry content", () => {
  it("uses npx command with @membank/cli --mcp args", () => {
    const { resolver, dir } = makeTmpResolver();
    const writer = new HarnessConfigWriter(resolver);
    writer.write("claude-code");

    const cfg = readJson(claudeCodePath(dir));
    const entry = (cfg["mcpServers"] as Record<string, unknown>)["membank"] as {
      command: string;
      args: string[];
    };
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["@membank/cli", "--mcp"]);
  });
});
