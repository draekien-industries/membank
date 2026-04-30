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
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};

      const sessionStartInner = (
        Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []
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
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneNestedEvent(newHooks, "UserPromptSubmit");
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

      return {
        status: "ready",
        configPath: cfgPath,
        hooks: [
          {
            event: "sessionStart",
            command: "npx -y @membank/cli inject --harness copilot-cli",
            existingCommand: extractInjectCommand(sessionStart) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneFlatEvent(newHooks, "userPromptSubmitted");
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

      return {
        status: "ready",
        configPath: cfgPath,
        hooks: [
          {
            event: "SessionStart",
            command: "npx -y @membank/cli inject --harness codex",
            existingCommand: extractInjectCommand(sessionStartInner) || null,
          },
        ],
      };
    },

    write(resolver, events) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);
      const hooks = (cfg.hooks as Record<string, unknown> | undefined) ?? {};
      const newHooks: Record<string, unknown> = { ...hooks };

      // Cleanup: drop legacy membank entries from removed event slots regardless of `events`.
      pruneNestedEvent(newHooks, "UserPromptSubmit");
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
