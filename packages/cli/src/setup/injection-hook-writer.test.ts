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

const ALL_CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUseFailure"] as const;

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
  it("write returns not-supported", () => {
    const { resolver } = makeTmpResolver();
    const writer = new InjectionHookWriter(resolver);
    expect(writer.write("nonexistent", [])).toEqual({ status: "not-supported" });
  });

  it("inspect returns not-supported", () => {
    const { resolver } = makeTmpResolver();
    const writer = new InjectionHookWriter(resolver);
    expect(writer.inspect("nonexistent")).toEqual({ status: "not-supported" });
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
    const result = writer.write("claude-code", [...ALL_CLAUDE_EVENTS]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(Array.isArray(hooks.UserPromptSubmit)).toBe(true);
    expect(Array.isArray(hooks.PostToolUseFailure)).toBe(true);
  });

  it("SessionStart hook uses correct command", () => {
    writer.write("claude-code", [...ALL_CLAUDE_EVENTS]);
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
    writer.write("claude-code", [...ALL_CLAUDE_EVENTS]);
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
    writer.write("claude-code", [...ALL_CLAUDE_EVENTS]);
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

  it("only writes the requested events", () => {
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(hooks.UserPromptSubmit).toBeUndefined();
    expect(hooks.PostToolUseFailure).toBeUndefined();
  });

  it("overwrites only the requested events while preserving others", () => {
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
    writer.write("claude-code", ["UserPromptSubmit", "PostToolUseFailure"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(1); // preserved unchanged
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
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(2); // echo hello preserved + new membank
  });

  it("inspect returns not-configured when no hooks exist", () => {
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(3);
    for (const hook of result.hooks) {
      expect(hook.existingCommand).toBeNull();
    }
  });

  it("inspect returns existing commands when hooks are configured", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "npx @membank/cli inject --harness claude-code" }],
          },
        ],
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event user-prompt --harness claude-code",
              },
            ],
          },
        ],
      },
    });
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const sessionStart = result.hooks.find((h) => h.event === "SessionStart");
    const userPrompt = result.hooks.find((h) => h.event === "UserPromptSubmit");
    const toolFailure = result.hooks.find((h) => h.event === "PostToolUseFailure");

    expect(sessionStart?.existingCommand).toBe("npx @membank/cli inject --harness claude-code");
    expect(userPrompt?.existingCommand).toBe(
      "npx @membank/cli inject --event user-prompt --harness claude-code"
    );
    expect(toolFailure?.existingCommand).toBeNull();
  });

  it("inspect returns all three events with correct replacement commands", () => {
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const events = result.hooks.map((h) => h.event);
    expect(events).toContain("SessionStart");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("PostToolUseFailure");

    const sessionStart = result.hooks.find((h) => h.event === "SessionStart");
    expect(sessionStart?.command).toBe("npx @membank/cli inject --harness claude-code");

    const userPrompt = result.hooks.find((h) => h.event === "UserPromptSubmit");
    expect(userPrompt?.command).toContain("--event user-prompt");

    const toolFailure = result.hooks.find((h) => h.event === "PostToolUseFailure");
    expect(toolFailure?.command).toContain("--event tool-failure");
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
    const result = writer.write("copilot-cli", [
      "sessionStart",
      "userPromptSubmitted",
      "postToolUseFailure",
    ]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.sessionStart)).toBe(true);
    expect(Array.isArray(hooks.userPromptSubmitted)).toBe(true);
    expect(Array.isArray(hooks.postToolUseFailure)).toBe(true);
  });

  it("userPromptSubmitted uses --event user-prompt", () => {
    writer.write("copilot-cli", ["sessionStart", "userPromptSubmitted", "postToolUseFailure"]);
    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    type FlatHooks = { bash: string }[];
    const hooks = cfg.hooks as { userPromptSubmitted: FlatHooks; postToolUseFailure: FlatHooks };
    const bash = hooks.userPromptSubmitted[0]?.bash ?? "";
    expect(bash).toContain("--event user-prompt");
    expect(bash).toContain("--harness copilot-cli");
  });

  it("postToolUseFailure uses --event tool-failure", () => {
    writer.write("copilot-cli", ["sessionStart", "userPromptSubmitted", "postToolUseFailure"]);
    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    type FlatHooks = { bash: string }[];
    const hooks = cfg.hooks as { userPromptSubmitted: FlatHooks; postToolUseFailure: FlatHooks };
    const bash = hooks.postToolUseFailure[0]?.bash ?? "";
    expect(bash).toContain("--event tool-failure");
    expect(bash).toContain("--harness copilot-cli");
  });

  it("inspect returns existing command when sessionStart hook present", () => {
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
    const result = writer.inspect("copilot-cli");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const sessionStart = result.hooks.find((h) => h.event === "sessionStart");
    expect(sessionStart?.existingCommand).toBe("npx @membank/cli inject --harness copilot-cli");
  });

  it("inspect returns null existingCommand when not configured", () => {
    const result = writer.inspect("copilot-cli");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    for (const hook of result.hooks) {
      expect(hook.existingCommand).toBeNull();
    }
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
    const result = writer.write("codex", ["SessionStart", "UserPromptSubmit", "PostToolUse"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(Array.isArray(hooks.UserPromptSubmit)).toBe(true);
    expect(Array.isArray(hooks.PostToolUse)).toBe(true);
  });

  it("UserPromptSubmit uses --event user-prompt", () => {
    writer.write("codex", ["SessionStart", "UserPromptSubmit", "PostToolUse"]);
    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as { UserPromptSubmit: GroupHooks; PostToolUse: GroupHooks };
    const cmd = hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event user-prompt");
    expect(cmd).toContain("--harness codex");
  });

  it("PostToolUse uses --event tool-failure", () => {
    writer.write("codex", ["SessionStart", "UserPromptSubmit", "PostToolUse"]);
    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    type GroupHooks = { hooks: { command: string }[] }[];
    const hooks = cfg.hooks as { UserPromptSubmit: GroupHooks; PostToolUse: GroupHooks };
    const cmd = hooks.PostToolUse[0]?.hooks[0]?.command ?? "";
    expect(cmd).toContain("--event tool-failure");
    expect(cmd).toContain("--harness codex");
  });

  it("inspect returns existing command when SessionStart hook present", () => {
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
    const result = writer.inspect("codex");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const sessionStart = result.hooks.find((h) => h.event === "SessionStart");
    expect(sessionStart?.existingCommand).toBe("npx @membank/cli inject --harness codex");
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
    const result = writer.write("opencode", ["plugin"]);
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

  it("inspect returns null existingCommand when plugin does not exist", () => {
    const result = writer.inspect("opencode");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.existingCommand).toBeNull();
  });

  it("inspect returns existing path when plugin exists with inject command", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(
      pluginPath,
      "export default { hooks: { 'session.start': async ({ $ }) => $`npx @membank/cli inject`.text() } }"
    );
    const result = writer.inspect("opencode");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks[0]?.existingCommand).toBe(pluginPath);
  });

  it("overwrites plugin when called with plugin event", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(pluginPath, "old content");
    const result = writer.write("opencode", ["plugin"]);
    expect(result.status).toBe("written");
    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("session.start");
    expect(content).toContain("chat.message");
  });
});
