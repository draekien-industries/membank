import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  INJECTION_HARNESSES,
  InjectionHookWriter,
  type InjectionPathResolver,
} from "./injection-hook-writer.js";

function makeTmpResolver(): { resolver: InjectionPathResolver; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "membank-ihw-test-"));
  return { resolver: { home: () => dir }, dir };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeJson(path: string, data: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

describe("INJECTION_HARNESSES", () => {
  it("contains all 4 harnesses", () => {
    expect(INJECTION_HARNESSES).toContain("claude-code");
    expect(INJECTION_HARNESSES).toContain("copilot-cli");
    expect(INJECTION_HARNESSES).toContain("codex");
    expect(INJECTION_HARNESSES).toContain("opencode");
    expect(INJECTION_HARNESSES).toHaveLength(4);
  });
});

describe("InjectionHookWriter — unknown harness", () => {
  it("returns not-supported", () => {
    const { resolver } = makeTmpResolver();
    const writer = new InjectionHookWriter(resolver);
    expect(writer.write("nonexistent")).toEqual({ status: "not-supported" });
  });
});

// ---------- claude-code ----------

describe("claude-code", () => {
  let writer: InjectionHookWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new InjectionHookWriter(tmp.resolver);
  });

  it("writes SessionStart, UserPromptSubmit, and PostToolUseFailure hooks", () => {
    const result = writer.write("claude-code");
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(Array.isArray(hooks.UserPromptSubmit)).toBe(true);
    expect(Array.isArray(hooks.PostToolUseFailure)).toBe(true);
  });

  it("SessionStart hook uses correct command", () => {
    writer.write("claude-code");
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as {
      SessionStart: GroupHooks;
      UserPromptSubmit: GroupHooks;
      PostToolUseFailure: GroupHooks;
    };
    const cmd = hooks.SessionStart[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("inject --harness claude-code");
    expect(cmd).not.toContain("--event");
  });

  it("UserPromptSubmit hook uses --event user-prompt", () => {
    writer.write("claude-code");
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as {
      SessionStart: GroupHooks;
      UserPromptSubmit: GroupHooks;
      PostToolUseFailure: GroupHooks;
    };
    const cmd = hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event user-prompt");
    expect(cmd).toContain("--harness claude-code");
  });

  it("PostToolUseFailure hook uses --event tool-failure", () => {
    writer.write("claude-code");
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as {
      SessionStart: GroupHooks;
      UserPromptSubmit: GroupHooks;
      PostToolUseFailure: GroupHooks;
    };
    const cmd = hooks.PostToolUseFailure[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event tool-failure");
    expect(cmd).toContain("--harness claude-code");
  });

  it("returns already-configured when session-start hook present", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "npx @membank/cli inject --harness claude-code" }],
          },
        ],
      },
    });
    const result = writer.write("claude-code");
    expect(result.status).toBe("already-configured");
  });

  it("overwrites all three hooks when overwrite=true", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "npx @membank/cli inject --harness claude-code" }],
          },
        ],
      },
    });
    const result = writer.write("claude-code", true);
    expect(result.status).toBe("written");

    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    // Should have exactly 1 entry per event (old removed, new added)
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.UserPromptSubmit).toHaveLength(1);
    expect(hooks.PostToolUseFailure).toHaveLength(1);
  });

  it("preserves non-membank hooks in SessionStart on overwrite", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: "echo hello" }] },
          {
            matcher: "",
            hooks: [{ type: "command", command: "npx @membank/cli inject --harness claude-code" }],
          },
        ],
      },
    });
    writer.write("claude-code", true);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(2); // echo hello preserved + new membank
  });
});

// ---------- copilot-cli ----------

describe("copilot-cli", () => {
  let writer: InjectionHookWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new InjectionHookWriter(tmp.resolver);
  });

  it("writes sessionStart, userPromptSubmitted, and postToolUseFailure hooks", () => {
    const result = writer.write("copilot-cli");
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.sessionStart)).toBe(true);
    expect(Array.isArray(hooks.userPromptSubmitted)).toBe(true);
    expect(Array.isArray(hooks.postToolUseFailure)).toBe(true);
  });

  it("userPromptSubmitted uses --event user-prompt", () => {
    writer.write("copilot-cli");
    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    type FlatHooks = { bash: string }[];
    const hooks = cfg.hooks as { userPromptSubmitted: FlatHooks; postToolUseFailure: FlatHooks };
    const bash = hooks.userPromptSubmitted[0]?.bash ?? "";
    expect(bash).toContain("--event user-prompt");
    expect(bash).toContain("--harness copilot-cli");
  });

  it("postToolUseFailure uses --event tool-failure", () => {
    writer.write("copilot-cli");
    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    type FlatHooks = { bash: string }[];
    const hooks = cfg.hooks as { userPromptSubmitted: FlatHooks; postToolUseFailure: FlatHooks };
    const bash = hooks.postToolUseFailure[0]?.bash ?? "";
    expect(bash).toContain("--event tool-failure");
    expect(bash).toContain("--harness copilot-cli");
  });

  it("returns already-configured when sessionStart hook present", () => {
    const cfgPath = join(dir, ".copilot", "settings.json");
    writeJson(cfgPath, {
      version: 1,
      hooks: {
        sessionStart: [
          {
            type: "command",
            bash: "npx @membank/cli inject --harness copilot-cli",
            timeoutSec: 30,
          },
        ],
      },
    });
    expect(writer.write("copilot-cli").status).toBe("already-configured");
  });
});

// ---------- codex ----------

describe("codex", () => {
  let writer: InjectionHookWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new InjectionHookWriter(tmp.resolver);
  });

  it("writes SessionStart, UserPromptSubmit, and PostToolUse hooks", () => {
    const result = writer.write("codex");
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(Array.isArray(hooks.UserPromptSubmit)).toBe(true);
    expect(Array.isArray(hooks.PostToolUse)).toBe(true);
  });

  it("UserPromptSubmit uses --event user-prompt", () => {
    writer.write("codex");
    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as { UserPromptSubmit: GroupHooks; PostToolUse: GroupHooks };
    const cmd = hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event user-prompt");
    expect(cmd).toContain("--harness codex");
  });

  it("PostToolUse uses --event tool-failure", () => {
    writer.write("codex");
    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as { UserPromptSubmit: GroupHooks; PostToolUse: GroupHooks };
    const cmd = hooks.PostToolUse[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event tool-failure");
    expect(cmd).toContain("--harness codex");
  });

  it("returns already-configured when SessionStart hook present", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "npx @membank/cli inject --harness codex", timeout: 30 },
            ],
          },
        ],
      },
    });
    expect(writer.write("codex").status).toBe("already-configured");
  });
});

// ---------- opencode ----------

describe("opencode", () => {
  let writer: InjectionHookWriter;
  let dir: string;

  beforeEach(() => {
    const tmp = makeTmpResolver();
    dir = tmp.dir;
    writer = new InjectionHookWriter(tmp.resolver);
  });

  it("writes membank.js plugin with all three hooks", () => {
    const result = writer.write("opencode");
    expect(result.status).toBe("written");

    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    expect(existsSync(pluginPath)).toBe(true);

    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("session.start");
    expect(content).toContain("chat.message");
    expect(content).toContain("tool.execute.after");
    expect(content).toContain("--event user-prompt");
    expect(content).toContain("--event tool-failure");
  });

  it("returns already-configured when plugin exists with inject command", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(
      pluginPath,
      "export default { hooks: { 'session.start': async ({ $ }) => $`npx @membank/cli inject`.text() } }"
    );
    expect(writer.write("opencode").status).toBe("already-configured");
  });

  it("overwrites plugin when overwrite=true", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(pluginPath, "old content");
    const result = writer.write("opencode", true);
    expect(result.status).toBe("written");
    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("session.start");
    expect(content).toContain("chat.message");
  });
});
