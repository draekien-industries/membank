import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MaybeJsonObjectSchema, OptionalNumberSchema } from "../schemas.js";
import { readJson, writeJsonAtomic } from "../utils/json.js";

export type HookPlan = {
  event: string;
  command: string;
  existingCommand: string | null;
};

export type InspectResult =
  | { status: "not-supported" }
  | { status: "ready"; configPath: string; hooks: HookPlan[] };

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

function getHooksArray(group: unknown): unknown[] {
  if (typeof group !== "object" || group === null) return [];
  if (!("hooks" in group)) return [];
  return Array.isArray(group.hooks) ? group.hooks : [];
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
  return findMembankHookCommand(hooks, "@membank/cli") !== "";
}

function extractInjectCommand(hooks: unknown[]): string {
  return findMembankHookCommand(hooks, "@membank/cli");
}

// Removes hook groups that contain any membank inject command (any --event variant).
function filterOutMembank(groups: unknown[]): unknown[] {
  return groups.filter((g) => !containsMembankInject(getHooksArray(g)));
}

// Removes flat hook entries that contain any membank inject command.
function filterOutMembankFlat(hooks: unknown[]): unknown[] {
  return hooks.filter((h) => !containsMembankInject([h]));
}

// Strip every membank entry from a nested-group event slot. If the slot ends up empty,
// delete the key so the config stays tidy.
function pruneNestedEvent(hooks: Record<string, unknown>, eventKey: string): void {
  const existing = hooks[eventKey];
  if (!Array.isArray(existing)) return;
  const cleaned = filterOutMembank(existing);
  if (cleaned.length === 0) {
    delete hooks[eventKey];
  } else {
    hooks[eventKey] = cleaned;
  }
}

// Strip every membank entry from a flat-array event slot. If the slot ends up empty,
// delete the key so the config stays tidy.
function pruneFlatEvent(hooks: Record<string, unknown>, eventKey: string): void {
  const existing = hooks[eventKey];
  if (!Array.isArray(existing)) return;
  const cleaned = filterOutMembankFlat(existing);
  if (cleaned.length === 0) {
    delete hooks[eventKey];
  } else {
    hooks[eventKey] = cleaned;
  }
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
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};

      const sessionStartInner = (
        Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []
      ).flatMap(getHooksArray);

      const userPromptSubmitInner = (
        Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : []
      ).flatMap(getHooksArray);

      return {
        status: "ready",
        configPath: cfgPath,
        hooks: [
          {
            event: "SessionStart",
            command: "npx -y @membank/cli inject --harness claude-code",
            existingCommand: extractInjectCommand(sessionStartInner) || null,
          },
          {
            event: "UserPromptSubmit",
            command: "npx -y @membank/cli inject --harness claude-code --event user-prompt-submit",
            existingCommand: extractInjectCommand(userPromptSubmitInner) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneNestedEvent(newHooks, "PostToolUseFailure");

      if (events.includes("SessionStart")) {
        const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
        newHooks.SessionStart = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx -y @membank/cli inject --harness claude-code",
              },
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
                command:
                  "npx -y @membank/cli inject --harness claude-code --event user-prompt-submit",
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
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};

      const sessionStart = Array.isArray(hooks.sessionStart) ? hooks.sessionStart : [];
      const userPromptSubmitted = Array.isArray(hooks.userPromptSubmitted)
        ? hooks.userPromptSubmitted
        : [];

      return {
        status: "ready",
        configPath: cfgPath,
        hooks: [
          {
            event: "sessionStart",
            command: "npx -y @membank/cli inject --harness copilot-cli",
            existingCommand: extractInjectCommand(sessionStart) || null,
          },
          {
            event: "userPromptSubmitted",
            command: "npx -y @membank/cli inject --harness copilot-cli --event user-prompt-submit",
            existingCommand: extractInjectCommand(userPromptSubmitted) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneFlatEvent(newHooks, "postToolUseFailure");

      if (events.includes("sessionStart")) {
        const existing = Array.isArray(hooks.sessionStart) ? hooks.sessionStart : [];
        newHooks.sessionStart = [
          ...filterOutMembankFlat(existing),
          {
            type: "command",
            bash: "npx -y @membank/cli inject --harness copilot-cli",
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
            bash: "npx -y @membank/cli inject --harness copilot-cli --event user-prompt-submit",
            timeoutSec: 30,
          },
        ];
      }

      writeJsonAtomic(cfgPath, {
        version: OptionalNumberSchema.parse(cfg.version) ?? 1,
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
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};

      const sessionStartInner = (
        Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []
      ).flatMap(getHooksArray);

      const userPromptSubmitInner = (
        Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : []
      ).flatMap(getHooksArray);

      return {
        status: "ready",
        configPath: cfgPath,
        hooks: [
          {
            event: "SessionStart",
            command: "npx -y @membank/cli inject --harness codex",
            existingCommand: extractInjectCommand(sessionStartInner) || null,
          },
          {
            event: "UserPromptSubmit",
            command: "npx -y @membank/cli inject --harness codex --event user-prompt-submit",
            existingCommand: extractInjectCommand(userPromptSubmitInner) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);
      const hooks = MaybeJsonObjectSchema.parse(cfg.hooks) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneNestedEvent(newHooks, "PostToolUse");

      if (events.includes("SessionStart")) {
        const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
        newHooks.SessionStart = [
          ...filterOutMembank(existing),
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "npx -y @membank/cli inject --harness codex",
                timeout: 30,
              },
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
                command: "npx -y @membank/cli inject --harness codex --event user-prompt-submit",
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
        if (content.includes("@membank/cli")) {
          existingCommand = pluginPath;
        }
      }
      return {
        status: "ready",
        configPath: pluginPath,
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
    "      return await $`npx -y @membank/cli inject`.text();",
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
