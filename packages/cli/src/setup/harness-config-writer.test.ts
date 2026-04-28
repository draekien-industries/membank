import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandRunner, ExecResult } from "../utils/execFileNoThrow.js";
import {
  HarnessConfigWriter,
  type PathResolver,
  SUPPORTED_HARNESSES,
} from "./harness-config-writer.js";

// Create a fresh isolated temp directory for each test.
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "membank-test-"));
}

function makeTmpResolver(): { resolver: PathResolver; dir: string } {
  const dir = makeTmpDir();
  return { resolver: { home: () => dir, cwd: () => dir }, dir };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeJson(path: string, data: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// A runner that always succeeds and returns empty output.
function successRunner(): CommandRunner {
  return vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 } satisfies ExecResult);
}

// A runner where codex mcp list returns output containing "membank".
function codexConfiguredRunner(): CommandRunner {
  return vi.fn(async (cmd: string, args: string[]): Promise<ExecResult> => {
    if (cmd === "codex" && args[0] === "mcp" && args[1] === "list") {
      return { stdout: "membank\n", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  });
}

// A runner that returns ENOENT (CLI not found).
function notFoundRunner(cli: string): CommandRunner {
  return vi.fn().mockResolvedValue({
    stdout: "",
    stderr: `Command not found: ${cli}`,
    exitCode: 127,
  } satisfies ExecResult);
}

// --- claude-code config path helpers ---
function claudeJsonPath(dir: string): string {
  return join(dir, ".claude.json");
}
function vscodePath(dir: string): string {
  return join(dir, ".vscode", "mcp.json");
}
function opencodePath(dir: string): string {
  return join(dir, ".config", "opencode", "opencode.json");
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
  it("throws for an unrecognised harness name", async () => {
    const { resolver } = makeTmpResolver();
    const writer = new HarnessConfigWriter(resolver, successRunner());
    await expect(writer.write("nonexistent")).rejects.toThrow("Unknown harness: nonexistent");
  });
});

// ---------- claude-code ----------

describe("claude-code", () => {
  let run: ReturnType<typeof successRunner>;
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    run = successRunner();
    writer = new HarnessConfigWriter(tmp.resolver, run);
  });

  it("invokes claude mcp add --scope user when not configured", async () => {
    const result = await writer.write("claude-code");
    expect(result.status).toBe("written");
    expect(run).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["mcp", "add", "--scope", "user", "membank"])
    );
  });

  it("returns already-configured when membank key present in ~/.claude.json mcpServers", async () => {
    writeJson(claudeJsonPath(dir), {
      mcpServers: { membank: { command: "npx", args: ["@membank/cli@latest", "--mcp"] } },
    });
    const result = await writer.write("claude-code");
    expect(result.status).toBe("already-configured");
    expect(run).not.toHaveBeenCalled();
  });

  it("removes then re-adds when overwrite:true", async () => {
    writeJson(claudeJsonPath(dir), {
      mcpServers: { membank: { command: "old", args: [] } },
    });
    const result = await writer.write("claude-code", { overwrite: true });
    expect(result.status).toBe("written");
    expect(run).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["mcp", "remove", "--scope", "user", "membank"])
    );
    expect(run).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["mcp", "add", "--scope", "user", "membank"])
    );
  });

  it("throws a friendly error when claude CLI is not found", async () => {
    const writer2 = new HarnessConfigWriter(
      { home: () => dir, cwd: () => dir },
      notFoundRunner("claude")
    );
    await expect(writer2.write("claude-code")).rejects.toThrow("claude CLI not found");
  });

  it("passes @membank/cli@latest --mcp as the stdio command args", async () => {
    await writer.write("claude-code");
    const call = (run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    expect(call[1]).toContain("@membank/cli@latest");
    expect(call[1]).toContain("--mcp");
  });
});

// ---------- vscode ----------

describe("vscode", () => {
  let run: ReturnType<typeof successRunner>;
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    run = successRunner();
    writer = new HarnessConfigWriter(tmp.resolver, run);
  });

  it("invokes code --folder-uri --add-mcp when not configured", async () => {
    const result = await writer.write("vscode");
    expect(result.status).toBe("written");
    expect(run).toHaveBeenCalledWith("code", expect.arrayContaining(["--add-mcp"]));
  });

  it("passes a JSON payload containing membank command and args", async () => {
    await writer.write("vscode");
    const call = (run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    const payloadArg = call[1][call[1].indexOf("--add-mcp") + 1];
    const payload = JSON.parse(payloadArg ?? "{}") as {
      name: string;
      command: string;
      args: string[];
    };
    expect(payload.name).toBe("membank");
    expect(payload.command).toBe("npx");
    expect(payload.args).toContain("@membank/cli@latest");
  });

  it("returns already-configured when servers.membank present in .vscode/mcp.json", async () => {
    writeJson(vscodePath(dir), {
      servers: { membank: { command: "npx", args: ["@membank/cli@latest", "--mcp"] } },
    });
    const result = await writer.write("vscode");
    expect(result.status).toBe("already-configured");
    expect(run).not.toHaveBeenCalled();
  });

  it("updates .vscode/mcp.json directly for overwrite (no remove CLI)", async () => {
    writeJson(vscodePath(dir), {
      servers: { membank: { command: "old", args: [] }, other: { command: "other-cmd", args: [] } },
    });
    const result = await writer.write("vscode", { overwrite: true });
    expect(result.status).toBe("written");
    // CLI should NOT be invoked for overwrite
    expect(run).not.toHaveBeenCalled();
    const cfg = readJson(vscodePath(dir));
    const servers = cfg.servers as Record<string, unknown>;
    expect(servers.other).toBeDefined();
    const membank = servers.membank as { command: string; args: string[] };
    expect(membank.command).toBe("npx");
  });

  it("throws a friendly error when code CLI is not found", async () => {
    const writer2 = new HarnessConfigWriter(
      { home: () => dir, cwd: () => dir },
      notFoundRunner("code")
    );
    await expect(writer2.write("vscode")).rejects.toThrow("code CLI not found");
  });
});

// ---------- codex ----------

describe("codex", () => {
  let run: ReturnType<typeof successRunner>;
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    run = successRunner();
    writer = new HarnessConfigWriter(tmp.resolver, run);
  });

  it("invokes codex mcp add when not configured", async () => {
    const result = await writer.write("codex");
    expect(result.status).toBe("written");
    expect(run).toHaveBeenCalledWith("codex", expect.arrayContaining(["mcp", "add", "membank"]));
  });

  it("queries codex mcp list to check if already configured", async () => {
    const runFn = successRunner();
    const writer2 = new HarnessConfigWriter({ home: () => dir, cwd: () => dir }, runFn);
    await writer2.write("codex");
    expect(runFn).toHaveBeenCalledWith("codex", ["mcp", "list"]);
  });

  it("returns already-configured when codex mcp list output contains membank", async () => {
    const result = await new HarnessConfigWriter(
      { home: () => dir, cwd: () => dir },
      codexConfiguredRunner()
    ).write("codex");
    expect(result.status).toBe("already-configured");
  });

  it("removes then re-adds when overwrite:true and already configured", async () => {
    const runFn = codexConfiguredRunner();
    const result = await new HarnessConfigWriter({ home: () => dir, cwd: () => dir }, runFn).write(
      "codex",
      { overwrite: true }
    );
    expect(result.status).toBe("written");
    expect(runFn).toHaveBeenCalledWith("codex", ["mcp", "remove", "membank"]);
    expect(runFn).toHaveBeenCalledWith("codex", expect.arrayContaining(["mcp", "add", "membank"]));
  });

  it("throws a friendly error when codex CLI is not found", async () => {
    const writer2 = new HarnessConfigWriter(
      { home: () => dir, cwd: () => dir },
      notFoundRunner("codex")
    );
    await expect(writer2.write("codex")).rejects.toThrow("codex CLI not found");
  });
});

// ---------- opencode ----------

describe("opencode", () => {
  let run: ReturnType<typeof successRunner>;
  let writer: HarnessConfigWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    run = successRunner();
    writer = new HarnessConfigWriter(tmp.resolver, run);
  });

  it("writes membank entry under mcp key with correct schema", async () => {
    const result = await writer.write("opencode");
    expect(result.status).toBe("written");

    const cfg = readJson(opencodePath(dir));
    const entry = (cfg.mcp as Record<string, unknown>).membank as {
      type: string;
      command: string[];
    };
    expect(entry.type).toBe("local");
    expect(entry.command).toContain("npx");
    expect(entry.command).toContain("@membank/cli@latest");
    expect(entry.command).toContain("--mcp");
  });

  it("writes to ~/.config/opencode/opencode.json (not config.json)", async () => {
    await writer.write("opencode");
    expect(() => readJson(opencodePath(dir))).not.toThrow();
  });

  it("merges without corrupting existing mcp keys", async () => {
    writeJson(opencodePath(dir), {
      mcp: { existing: { type: "local", command: ["z", "--run"] } },
    });
    await writer.write("opencode");
    const mcp = readJson(opencodePath(dir)).mcp as Record<string, unknown>;
    expect(mcp.existing).toBeDefined();
    expect(mcp.membank).toBeDefined();
  });

  it("returns already-configured when mcp.membank present", async () => {
    writeJson(opencodePath(dir), {
      mcp: { membank: { type: "local", command: ["npx", "@membank/cli@latest", "--mcp"] } },
    });
    const result = await writer.write("opencode");
    expect(result.status).toBe("already-configured");
  });

  it("overwrites when overwrite:true", async () => {
    writeJson(opencodePath(dir), {
      mcp: { membank: { type: "local", command: ["old"] } },
    });
    const result = await writer.write("opencode", { overwrite: true });
    expect(result.status).toBe("written");
    const entry = (readJson(opencodePath(dir)).mcp as Record<string, unknown>).membank as {
      command: string[];
    };
    expect(entry.command).toContain("@membank/cli@latest");
  });

  it("does not invoke the command runner (file-based write)", async () => {
    await writer.write("opencode");
    expect(run).not.toHaveBeenCalled();
  });
});
