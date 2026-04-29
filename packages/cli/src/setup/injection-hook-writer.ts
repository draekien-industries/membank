import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type HookPlan = {
  event: string;
  command: string;
  existingCommand: string | null;
};

export type InspectResult = { status: "not-supported" } | { status: "ready"; hooks: HookPlan[] };

export type InjectionWriteResult = { status: "written" } | { status: "not-supported" };

export interface InjectionPathResolver {
  home: () => string;
}

const defaultPathResolver: InjectionPathResolver = {
  home: () => {
    const h = process.env.HOME ?? process.env.USERPROFILE;
    if (!h) throw new Error("Cannot determine home directory");
    return h;
  },
};

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonAtomic(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(mkdtempSync(join(tmpdir(), "membank-hook-")), "cfg.json");
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

function getHooksArray(group: unknown): unknown[] {
  if (typeof group !== "object" || group === null) return [];
  const h = (group as { hooks?: unknown }).hooks;
  return Array.isArray(h) ? h : [];
}

function findMembankHookCommand(hooks: unknown[], pattern: string): string {
  for (const h of hooks) {
    if (typeof h !== "object" || h === null) continue;
    if ("command" in h && typeof h.command === "string" && h.command.includes(pattern)) {
      return h.command;
    }
    if ("bash" in h && typeof h.bash === "string" && h.bash.includes(pattern)) {
      return h.bash;
    }
  }
  return "";
}

function containsMembankInject(hooks: unknown[]): boolean {
  return findMembankHookCommand(hooks, "@membank/cli inject") !== "";
}

function extractInjectCommand(hooks: unknown[]): string {
  return findMembankHookCommand(hooks, "@membank/cli inject");
}

// Removes hook groups that contain any membank inject command (any --event variant).
function filterOutMembank(groups: unknown[]): unknown[] {
  return groups.filter((g) => !containsMembankInject(getHooksArray(g)));
}

// Removes flat hook entries that contain any membank inject command.
function filterOutMembankFlat(hooks: unknown[]): unknown[] {
  return hooks.filter((h) => !containsMembankInject([h]));
}

interface HarnessInjectionWriter {
  inspect(resolver: InjectionPathResolver): InspectResult;
  write(resolver: InjectionPathResolver, events: string[]): InjectionWriteResult;
}

const writers: Record<string, HarnessInjectionWriter> = {
  "claude-code": {
    inspect(resolver) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};

      const sessionStartInner = (
        Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []
      ).flatMap(getHooksArray);
      const userPromptInner = (
        Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : []
      ).flatMap(getHooksArray);
      const toolFailureInner = (
        Array.isArray(hooks.PostToolUseFailure) ? hooks.PostToolUseFailure : []
      ).flatMap(getHooksArray);

      return {
        status: "ready",
        hooks: [
          {
            event: "SessionStart",
            command: "npx @membank/cli inject --harness claude-code",
            existingCommand: extractInjectCommand(sessionStartInner) || null,
          },
          {
            event: "UserPromptSubmit",
            command: "npx @membank/cli inject --event user-prompt --harness claude-code",
            existingCommand: extractInjectCommand(userPromptInner) || null,
          },
          {
            event: "PostToolUseFailure",
            command: "npx @membank/cli inject --event tool-failure --harness claude-code",
            existingCommand: extractInjectCommand(toolFailureInner) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      if (events.includes("SessionStart")) {
        const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
        newHooks.SessionStart = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [{ type: "command", command: "npx @membank/cli inject --harness claude-code" }],
          },
        ];
      }

      if (events.includes("UserPromptSubmit")) {
        const existing = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
        newHooks.UserPromptSubmit = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event user-prompt --harness claude-code",
              },
            ],
          },
        ];
      }

      if (events.includes("PostToolUseFailure")) {
        const existing = Array.isArray(hooks.PostToolUseFailure) ? hooks.PostToolUseFailure : [];
        newHooks.PostToolUseFailure = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx @membank/cli inject --event tool-failure --harness claude-code",
              },
            ],
          },
        ];
      }

      writeJsonAtomic(cfgPath, { ...cfg, hooks: newHooks });
      return { status: "written" };
    },
  },

  "copilot-cli": {
    inspect(resolver) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};

      const sessionStart = Array.isArray(hooks.sessionStart) ? hooks.sessionStart : [];
      const userPrompt = Array.isArray(hooks.userPromptSubmitted) ? hooks.userPromptSubmitted : [];
      const toolFailure = Array.isArray(hooks.postToolUseFailure) ? hooks.postToolUseFailure : [];

      return {
        status: "ready",
        hooks: [
          {
            event: "sessionStart",
            command: "npx @membank/cli inject --harness copilot-cli",
            existingCommand: extractInjectCommand(sessionStart) || null,
          },
          {
            event: "userPromptSubmitted",
            command: "npx @membank/cli inject --event user-prompt --harness copilot-cli",
            existingCommand: extractInjectCommand(userPrompt) || null,
          },
          {
            event: "postToolUseFailure",
            command: "npx @membank/cli inject --event tool-failure --harness copilot-cli",
            existingCommand: extractInjectCommand(toolFailure) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      if (events.includes("sessionStart")) {
        const existing = Array.isArray(hooks.sessionStart) ? hooks.sessionStart : [];
        newHooks.sessionStart = [
          ...filterOutMembankFlat(existing),
          {
            type: "command",
            bash: "npx @membank/cli inject --harness copilot-cli",
            timeoutSec: 30,
          },
        ];
      }

      if (events.includes("userPromptSubmitted")) {
        const existing = Array.isArray(hooks.userPromptSubmitted) ? hooks.userPromptSubmitted : [];
        newHooks.userPromptSubmitted = [
          ...filterOutMembankFlat(existing),
          {
            type: "command",
            bash: "npx @membank/cli inject --event user-prompt --harness copilot-cli",
            timeoutSec: 30,
          },
        ];
      }

      if (events.includes("postToolUseFailure")) {
        const existing = Array.isArray(hooks.postToolUseFailure) ? hooks.postToolUseFailure : [];
        newHooks.postToolUseFailure = [
          ...filterOutMembankFlat(existing),
          {
            type: "command",
            bash: "npx @membank/cli inject --event tool-failure --harness copilot-cli",
            timeoutSec: 30,
          },
        ];
      }

      writeJsonAtomic(cfgPath, {
        version: (cfg.version as number | undefined) ?? 1,
        ...cfg,
        hooks: newHooks,
      });
      return { status: "written" };
    },
  },

  codex: {
    inspect(resolver) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};

      const sessionStartInner = (
        Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []
      ).flatMap(getHooksArray);
      const userPromptInner = (
        Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : []
      ).flatMap(getHooksArray);
      const toolUseInner = (Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : []).flatMap(
        getHooksArray
      );

      return {
        status: "ready",
        hooks: [
          {
            event: "SessionStart",
            command: "npx @membank/cli inject --harness codex",
            existingCommand: extractInjectCommand(sessionStartInner) || null,
          },
          {
            event: "UserPromptSubmit",
            command: "npx @membank/cli inject --event user-prompt --harness codex",
            existingCommand: extractInjectCommand(userPromptInner) || null,
          },
          {
            event: "PostToolUse",
            command: "npx @membank/cli inject --event tool-failure --harness codex",
            existingCommand: extractInjectCommand(toolUseInner) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      if (events.includes("SessionStart")) {
        const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
        newHooks.SessionStart = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [
              { type: "command", command: "npx @membank/cli inject --harness codex", timeout: 30 },
            ],
          },
        ];
      }

      if (events.includes("UserPromptSubmit")) {
        const existing = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
        newHooks.UserPromptSubmit = [
          ...filterOutMembank(existing),
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
        ];
      }

      if (events.includes("PostToolUse")) {
        const existing = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];
        newHooks.PostToolUse = [
          ...filterOutMembank(existing),
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
        ];
      }

      writeJsonAtomic(cfgPath, { ...cfg, hooks: newHooks });
      return { status: "written" };
    },
  },

  opencode: {
    inspect(resolver) {
      const pluginPath = join(resolver.home(), ".config", "opencode", "plugins", "membank.js");
      let existingCommand: string | null = null;
      if (existsSync(pluginPath)) {
        const content = readFileSync(pluginPath, "utf8");
        if (content.includes("@membank/cli inject")) {
          existingCommand = pluginPath;
        }
      }
      return {
        status: "ready",
        hooks: [
          {
            event: "plugin",
            command: pluginPath,
            existingCommand,
          },
        ],
      };
    },

    write(resolver, events) {
      if (events.length === 0) return { status: "written" };
      const pluginPath = join(resolver.home(), ".config", "opencode", "plugins", "membank.js");
      mkdirSync(dirname(pluginPath), { recursive: true });
      writeFileSync(pluginPath, `${newOpencodePlugin()}\n`, "utf8");
      return { status: "written" };
    },
  },
};

function newOpencodePlugin(): string {
  return [
    "export default {",
    "  hooks: {",
    '    "session.start": async ({ $ }) => {',
    "      return await $`npx @membank/cli inject`.text();",
    "    },",
    '    "chat.message": async ({ $, message }) => {',
    '      const input = JSON.stringify({ prompt: message?.content ?? "" });',
    "      return await $`npx @membank/cli inject --event user-prompt`.stdin(input).text();",
    "    },",
    '    "tool.execute.after": async ({ $, result }) => {',
    "      if (!result?.exitCode && !result?.error) return;",
    "      const payload = JSON.stringify({",
    '        tool_name: result.tool ?? "unknown",',
    '        error_message: result.error ?? ("exit code " + result.exitCode),',
    "      });",
    "      return await $`npx @membank/cli inject --event tool-failure`.stdin(payload).text();",
    "    },",
    "  },",
    "};",
  ].join("\n");
}

export const INJECTION_HARNESSES = Object.keys(writers) as (keyof typeof writers)[];

export class InjectionHookWriter {
  readonly #resolver: InjectionPathResolver;

  constructor(resolver: InjectionPathResolver = defaultPathResolver) {
    this.#resolver = resolver;
  }

  inspect(harness: string): InspectResult {
    const writer = writers[harness];
    if (!writer) return { status: "not-supported" };
    return writer.inspect(this.#resolver);
  }

  write(harness: string, events: string[]): InjectionWriteResult {
    const writer = writers[harness];
    if (!writer) return { status: "not-supported" };
    return writer.write(this.#resolver, events);
  }
}
