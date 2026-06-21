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
  it("contains all 3 harnesses", () => {
    expect(INJECTION_HARNESSES).toContain("claude-code");
    expect(INJECTION_HARNESSES).toContain("codex");
    expect(INJECTION_HARNESSES).toContain("opencode");
    expect(INJECTION_HARNESSES).not.toContain("copilot-cli");
    expect(INJECTION_HARNESSES).toHaveLength(3);
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

  it("writes the SessionStart hook with the correct command", () => {
    const result = writer.write("claude-code", ["SessionStart"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;

    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    type GroupHooks = { hooks: { command: string }[] }[];
    const cmd = (hooks.SessionStart as GroupHooks)[0]?.hooks[0]?.command ?? "";
    expect(cmd).toBe("npx -y @membank/cli inject --harness claude-code");
  });

  it("only writes SessionStart when only SessionStart is requested (fresh config)", () => {
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(hooks.UserPromptSubmit).toBeUndefined();
    expect(hooks.PostToolUseFailure).toBeUndefined();
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

  it("prunes both PostToolUseFailure (legacy) and UserPromptSubmit membank hooks when writing SessionStart", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
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
        PostToolUseFailure: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event tool-failure --harness claude-code",
              },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.UserPromptSubmit).toBeUndefined();
    expect(hooks.PostToolUseFailure).toBeUndefined();
    expect(Array.isArray(hooks.SessionStart)).toBe(true);
  });

  it("preserves non-membank UserPromptSubmit entries but strips membank ones on any write", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        UserPromptSubmit: [
          { matcher: "", hooks: [{ type: "command", command: "echo not-membank" }] },
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
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.UserPromptSubmit).toHaveLength(1); // non-membank entry survives
  });

  it("inspect returns three hook entries (SessionStart + SessionEnd + PreToolUse) when nothing is configured", () => {
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(3);
    expect(result.hooks[0]?.event).toBe("SessionStart");
    expect(result.hooks[0]?.existingCommand).toBeNull();
    expect(result.hooks[1]?.event).toBe("SessionEnd");
    expect(result.hooks[1]?.existingCommand).toBeNull();
    expect(result.hooks[2]?.event).toBe("PreToolUse");
    expect(result.hooks[2]?.existingCommand).toBeNull();
  });

  it("writes the SessionEnd hook with the async extract command and session matchers", () => {
    const result = writer.write("claude-code", ["SessionEnd"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    type GroupHooks = {
      matcher: string;
      hooks: { command: string; async?: boolean; timeout?: number }[];
    }[];
    const group = (hooks.SessionEnd as GroupHooks)[0];
    expect(group?.matcher).toBe("clear|resume|logout|prompt_input_exit|other");
    const entry = group?.hooks[0];
    expect(entry?.command).toBe("npx -y @membank/cli extract --harness claude-code");
    expect(entry?.async).toBe(true);
    expect(entry?.timeout).toBeGreaterThanOrEqual(60);
  });

  it("inspect detects existing SessionEnd command", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionEnd: [
          {
            matcher: "clear|resume|logout|prompt_input_exit|other",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli extract --harness claude-code",
                async: true,
              },
            ],
          },
        ],
      },
    });
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const sessionEnd = result.hooks.find((h) => h.event === "SessionEnd");
    expect(sessionEnd?.existingCommand).toBe("npx @membank/cli extract --harness claude-code");
  });

  it("prunes legacy Stop entry (inject --event session-stop) even when writing only SessionStart", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --harness claude-code --event session-stop",
              },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.Stop).toBeUndefined();
  });

  it("prunes legacy Stop extract entry (extract --harness claude-code) when writing SessionEnd", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx -y @membank/cli extract --harness claude-code",
                async: true,
                timeout: 600,
              },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["SessionEnd"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.Stop).toBeUndefined();
    expect(Array.isArray(hooks.SessionEnd)).toBe(true);
  });

  it("inspect returns the existing SessionStart command when configured", () => {
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
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks[0]?.existingCommand).toBe("npx @membank/cli inject --harness claude-code");
  });

  it("writes the PreToolUse hook with the Skill|mcp matcher and PreToolUse command", () => {
    const result = writer.write("claude-code", ["PreToolUse"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    type GroupHooks = { matcher: string; hooks: { command: string }[] }[];
    const group = (hooks.PreToolUse as GroupHooks)[0];
    expect(group?.matcher).toBe("Skill|mcp__.*");
    expect(group?.hooks[0]?.command).toBe(
      "npx -y @membank/cli inject --harness claude-code --event PreToolUse"
    );
  });

  it("registers exactly one membank PreToolUse group when re-run (idempotent)", () => {
    writer.write("claude-code", ["PreToolUse"]);
    writer.write("claude-code", ["PreToolUse"]);
    const cfg = readJson(join(dir, ".claude", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toHaveLength(1);
  });

  it("preserves non-membank PreToolUse groups while replacing the membank one", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo guard" }] },
          {
            matcher: "Skill|mcp__.*",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --harness claude-code --event PreToolUse",
              },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["PreToolUse"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toHaveLength(2); // echo guard preserved + one membank
  });

  it("inspect detects an existing PreToolUse command", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        PreToolUse: [
          {
            matcher: "Skill|mcp__.*",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --harness claude-code --event PreToolUse",
              },
            ],
          },
        ],
      },
    });
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const preToolUse = result.hooks.find((h) => h.event === "PreToolUse");
    expect(preToolUse?.existingCommand).toBe(
      "npx @membank/cli inject --harness claude-code --event PreToolUse"
    );
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

  it("writes the SessionStart hook with the correct command", () => {
    const result = writer.write("codex", ["SessionStart"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".codex", "hooks.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    type GroupHooks = { hooks: { command: string }[] }[];
    const cmd = (hooks.SessionStart as GroupHooks)[0]?.hooks[0]?.command ?? "";
    expect(cmd).toBe("npx -y @membank/cli inject --harness codex");
  });

  it("prunes PostToolUse and UserPromptSubmit (legacy) when writing SessionStart", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event user-prompt --harness codex",
                timeout: 30,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event tool-failure --harness codex",
                timeout: 30,
              },
            ],
          },
        ],
      },
    });
    writer.write("codex", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.UserPromptSubmit).toBeUndefined();
    expect(hooks.PostToolUse).toBeUndefined();
    expect(Array.isArray(hooks.SessionStart)).toBe(true);
  });

  it("inspect returns one hook entry and detects existing SessionStart command", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --harness codex",
                timeout: 30,
              },
            ],
          },
        ],
      },
    });
    const result = writer.inspect("codex");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.existingCommand).toBe("npx @membank/cli inject --harness codex");
  });

  it("prunes legacy Stop entry on any write", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --harness codex --event session-stop",
                timeout: 30,
              },
            ],
          },
        ],
      },
    });
    writer.write("codex", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.Stop).toBeUndefined();
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

  it("writes membank.js plugin using experimental.chat.system.transform", () => {
    const result = writer.write("opencode", ["plugin"]);
    expect(result.status).toBe("written");

    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    expect(existsSync(pluginPath)).toBe(true);

    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("experimental.chat.system.transform");
    expect(content).toContain("output.system.push");
    expect(content).not.toContain("session.start");
    expect(content).not.toContain("chat.message");
    expect(content).not.toContain("--event user-prompt");
    expect(content).not.toContain("--event tool-failure");
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

  it("overwrites plugin when called with plugin event (replaces legacy plugin)", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(
      pluginPath,
      [
        "export default {",
        "  hooks: {",
        '    "session.start": async ({ $ }) => $`npx @membank/cli inject`.text(),',
        "  },",
        "};",
      ].join("\n")
    );
    const result = writer.write("opencode", ["plugin"]);
    expect(result.status).toBe("written");
    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("experimental.chat.system.transform");
    expect(content).not.toContain("session.start");
  });
});
