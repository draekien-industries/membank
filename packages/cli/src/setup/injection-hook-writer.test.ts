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
    expect(cmd).toBe("npx -y @membank/cli@latest inject --harness claude-code");
  });

  it("only writes SessionStart when only SessionStart is requested", () => {
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
            hooks: [
              { type: "command", command: "npx @membank/cli@latest inject --harness claude-code" },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(2); // echo hello preserved + new membank
  });

  it("prunes legacy membank entries from removed event slots on write", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli@latest inject --event user-prompt --harness claude-code",
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
                command:
                  "npx @membank/cli@latest inject --event tool-failure --harness claude-code",
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

  it("preserves non-membank hooks in legacy event slots while pruning membank ones", () => {
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
                command: "npx @membank/cli@latest inject --event user-prompt --harness claude-code",
              },
            ],
          },
        ],
      },
    });
    writer.write("claude-code", ["SessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(hooks.UserPromptSubmit).toHaveLength(1); // non-membank survives
  });

  it("inspect returns one hook entry (SessionStart only) when nothing is configured", () => {
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.event).toBe("SessionStart");
    expect(result.hooks[0]?.existingCommand).toBeNull();
  });

  it("inspect returns the existing SessionStart command when configured", () => {
    const cfgPath = join(dir, ".claude", "settings.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "npx @membank/cli@latest inject --harness claude-code" },
            ],
          },
        ],
      },
    });
    const result = writer.inspect("claude-code");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks[0]?.existingCommand).toBe(
      "npx @membank/cli@latest inject --harness claude-code"
    );
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

  it("writes the sessionStart hook with the correct command", () => {
    const result = writer.write("copilot-cli", ["sessionStart"]);
    expect(result.status).toBe("written");

    const cfg = readJson(join(dir, ".copilot", "settings.json"));
    const hooks = cfg.hooks as Record<string, unknown>;
    type FlatHooks = { bash: string }[];
    const bash = (hooks.sessionStart as FlatHooks)[0]?.bash ?? "";
    expect(bash).toBe("npx -y @membank/cli@latest inject --harness copilot-cli");
  });

  it("prunes legacy membank entries from removed event slots on write", () => {
    const cfgPath = join(dir, ".copilot", "settings.json");
    writeJson(cfgPath, {
      version: 1,
      hooks: {
        userPromptSubmitted: [
          {
            type: "command",
            bash: "npx @membank/cli@latest inject --event user-prompt --harness copilot-cli",
            timeoutSec: 30,
          },
        ],
        postToolUseFailure: [
          {
            type: "command",
            bash: "npx @membank/cli@latest inject --event tool-failure --harness copilot-cli",
            timeoutSec: 30,
          },
        ],
      },
    });
    writer.write("copilot-cli", ["sessionStart"]);
    const cfg = readJson(cfgPath);
    const hooks = cfg.hooks as Record<string, unknown>;
    expect(hooks.userPromptSubmitted).toBeUndefined();
    expect(hooks.postToolUseFailure).toBeUndefined();
    expect(Array.isArray(hooks.sessionStart)).toBe(true);
  });

  it("inspect returns existing command when sessionStart hook present", () => {
    const cfgPath = join(dir, ".copilot", "settings.json");
    writeJson(cfgPath, {
      version: 1,
      hooks: {
        sessionStart: [
          {
            type: "command",
            bash: "npx @membank/cli@latest inject --harness copilot-cli",
            timeoutSec: 30,
          },
        ],
      },
    });
    const result = writer.inspect("copilot-cli");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.existingCommand).toBe(
      "npx @membank/cli@latest inject --harness copilot-cli"
    );
  });

  it("inspect returns null existingCommand when not configured", () => {
    const result = writer.inspect("copilot-cli");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.existingCommand).toBeNull();
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
    expect(cmd).toBe("npx -y @membank/cli@latest inject --harness codex");
  });

  it("prunes legacy membank entries from removed event slots on write", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli@latest inject --event user-prompt --harness codex",
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
                command: "npx @membank/cli@latest inject --event tool-failure --harness codex",
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

  it("inspect returns existing command when SessionStart hook present", () => {
    const cfgPath = join(dir, ".codex", "hooks.json");
    writeJson(cfgPath, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli@latest inject --harness codex",
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
    expect(result.hooks[0]?.existingCommand).toBe("npx @membank/cli@latest inject --harness codex");
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

  it("writes membank.js plugin with only the session.start hook", () => {
    const result = writer.write("opencode", ["plugin"]);
    expect(result.status).toBe("written");

    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    expect(existsSync(pluginPath)).toBe(true);

    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("session.start");
    expect(content).not.toContain("chat.message");
    expect(content).not.toContain("tool.execute.after");
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
      "export default { hooks: { 'session.start': async ({ $ }) => $`npx @membank/cli@latest inject`.text() } }"
    );
    const result = writer.inspect("opencode");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.hooks[0]?.existingCommand).toBe(pluginPath);
  });

  it("overwrites plugin when called with plugin event (replaces legacy multi-hook plugin)", () => {
    const pluginPath = join(dir, ".config", "opencode", "plugins", "membank.js");
    mkdirSync(join(pluginPath, ".."), { recursive: true });
    writeFileSync(
      pluginPath,
      [
        "export default {",
        "  hooks: {",
        '    "session.start": async ({ $ }) => $`npx @membank/cli@latest inject`.text(),',
        '    "chat.message": async ({ $, message }) => $`npx @membank/cli@latest inject --event user-prompt`.text(),',
        "  },",
        "};",
      ].join("\n")
    );
    const result = writer.write("opencode", ["plugin"]);
    expect(result.status).toBe("written");
    const content = readFileSync(pluginPath, "utf8");
    expect(content).toContain("session.start");
    expect(content).not.toContain("chat.message");
  });
});
