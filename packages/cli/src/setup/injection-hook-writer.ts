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

export type InjectionWriteResult =
  | { status: "written" }
  | { status: "already-configured"; existing: string; replacement: string }
  | { status: "not-supported" };

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

interface HarnessInjectionWriter {
  write(resolver: InjectionPathResolver, overwrite?: boolean): InjectionWriteResult;
  readonly replacement: string;
}

const writers: Record<string, HarnessInjectionWriter> = {
  "claude-code": {
    replacement: "npx @membank/cli inject --harness claude-code",
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingGroups = Array.isArray(hooks?.SessionStart) ? hooks.SessionStart : [];
      const innerHooks = existingGroups.flatMap(getHooksArray);

      if (!overwrite && containsMembankInject(innerHooks)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(innerHooks),
          replacement: this.replacement,
        };
      }

      const filteredGroups = overwrite
        ? existingGroups.filter((g) => !containsMembankInject(getHooksArray(g)))
        : existingGroups;

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...filteredGroups,
            { matcher: "", hooks: [{ type: "command", command: this.replacement }] },
          ],
        },
      });
      return { status: "written" };
    },
  },

  "copilot-cli": {
    replacement: "npx @membank/cli inject --harness copilot-cli",
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingHooks = Array.isArray(hooks?.sessionStart) ? hooks.sessionStart : [];

      if (!overwrite && containsMembankInject(existingHooks)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(existingHooks),
          replacement: this.replacement,
        };
      }

      const filteredHooks = overwrite
        ? existingHooks.filter((h) => !containsMembankInject([h]))
        : existingHooks;

      writeJsonAtomic(cfgPath, {
        version: (cfg.version as number | undefined) ?? 1,
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          sessionStart: [
            ...filteredHooks,
            { type: "command", bash: this.replacement, timeoutSec: 30 },
          ],
        },
      });
      return { status: "written" };
    },
  },

  codex: {
    replacement: "npx @membank/cli inject --harness codex",
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingGroups = Array.isArray(hooks?.SessionStart) ? hooks.SessionStart : [];
      const innerHooks = existingGroups.flatMap(getHooksArray);

      if (!overwrite && containsMembankInject(innerHooks)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(innerHooks),
          replacement: this.replacement,
        };
      }

      const filteredGroups = overwrite
        ? existingGroups.filter((g) => !containsMembankInject(getHooksArray(g)))
        : existingGroups;

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...filteredGroups,
            { matcher: "", hooks: [{ type: "command", command: this.replacement, timeout: 30 }] },
          ],
        },
      });
      return { status: "written" };
    },
  },

  opencode: {
    replacement: "npx @membank/cli inject",
    write(resolver, overwrite = false) {
      const pluginPath = join(resolver.home(), ".config", "opencode", "plugins", "membank.js");

      if (!overwrite && existsSync(pluginPath)) {
        const existing = readFileSync(pluginPath, "utf8");
        if (existing.includes("@membank/cli inject")) {
          return {
            status: "already-configured",
            existing: existing.trim(),
            replacement: newOpencodePlugin(),
          };
        }
      }

      mkdirSync(dirname(pluginPath), { recursive: true });
      writeFileSync(pluginPath, `${newOpencodePlugin()}\n`, "utf8");
      return { status: "written" };
    },
  },
};

function newOpencodePlugin(includeIdle = false): string {
  const idleHook = includeIdle
    ? [
        '    "session.idle": async ({ $ }) => {',
        "      return await $`npx @membank/cli stop-hook --harness opencode`.text();",
        "    },",
      ]
    : [];
  return [
    "export default {",
    "  hooks: {",
    '    "session.start": async ({ $ }) => {',
    "      return await $`npx @membank/cli inject`.text();",
    "    },",
    ...idleHook,
    "  },",
    "};",
  ].join("\n");
}

export const INJECTION_HARNESSES = Object.keys(writers) as (keyof typeof writers)[];

export const STOP_HOOK_PROMPT =
  "Silently review this turn. If the user expressed a preference, correction, decision, or learning worth retaining across sessions, call save_memory. Output nothing — no explanation, no confirmation, no text. If nothing is worth saving, do nothing.";

function containsMembankStopHookCmd(hooks: unknown[]): boolean {
  return findMembankHookCommand(hooks, "@membank/cli stop-hook") !== "";
}

function extractStopHookCmd(hooks: unknown[]): string {
  return findMembankHookCommand(hooks, "@membank/cli stop-hook");
}

function containsMembankStopPrompt(stopGroups: unknown[]): boolean {
  return stopGroups.some((g) =>
    getHooksArray(g).some(
      (h) =>
        typeof h === "object" &&
        h !== null &&
        "type" in h &&
        h.type === "prompt" &&
        "prompt" in h &&
        typeof h.prompt === "string" &&
        h.prompt.includes("save_memory")
    )
  );
}

function extractStopPrompt(stopGroups: unknown[]): string {
  for (const g of stopGroups) {
    for (const h of getHooksArray(g)) {
      if (
        typeof h === "object" &&
        h !== null &&
        "type" in h &&
        h.type === "prompt" &&
        "prompt" in h &&
        typeof h.prompt === "string" &&
        h.prompt.includes("save_memory")
      ) {
        return h.prompt;
      }
    }
  }
  return "";
}

interface HarnessStopHookWriter {
  write(resolver: InjectionPathResolver, overwrite?: boolean): InjectionWriteResult;
}

const stopHookWriters: Record<string, HarnessStopHookWriter> = {
  "claude-code": {
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingStop = Array.isArray(hooks?.Stop) ? hooks.Stop : [];

      if (!overwrite && containsMembankStopPrompt(existingStop)) {
        return {
          status: "already-configured",
          existing: extractStopPrompt(existingStop),
          replacement: STOP_HOOK_PROMPT,
        };
      }

      const filteredStop = overwrite
        ? existingStop.filter((g) => !containsMembankStopPrompt([g]))
        : existingStop;

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          Stop: [...filteredStop, { hooks: [{ type: "prompt", prompt: STOP_HOOK_PROMPT }] }],
        },
      });
      return { status: "written" };
    },
  },

  "copilot-cli": {
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);
      const replacement = "npx @membank/cli stop-hook --harness copilot-cli";

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingStop = Array.isArray(hooks?.stop) ? hooks.stop : [];

      if (!overwrite && containsMembankStopHookCmd(existingStop)) {
        return {
          status: "already-configured",
          existing: extractStopHookCmd(existingStop),
          replacement,
        };
      }

      const filteredStop = overwrite
        ? existingStop.filter((h) => !containsMembankStopHookCmd([h]))
        : existingStop;

      writeJsonAtomic(cfgPath, {
        version: (cfg.version as number | undefined) ?? 1,
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          stop: [...filteredStop, { type: "command", bash: replacement, timeoutSec: 30 }],
        },
      });
      return { status: "written" };
    },
  },

  codex: {
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);
      const replacement = "npx @membank/cli stop-hook --harness codex";

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingGroups = Array.isArray(hooks?.Stop) ? hooks.Stop : [];
      const innerHooks = existingGroups.flatMap(getHooksArray);

      if (!overwrite && containsMembankStopHookCmd(innerHooks)) {
        return {
          status: "already-configured",
          existing: extractStopHookCmd(innerHooks),
          replacement,
        };
      }

      const filteredGroups = overwrite
        ? existingGroups.filter((g) => !containsMembankStopHookCmd(getHooksArray(g)))
        : existingGroups;

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          Stop: [
            ...filteredGroups,
            { matcher: "", hooks: [{ type: "command", command: replacement, timeout: 30 }] },
          ],
        },
      });
      return { status: "written" };
    },
  },

  opencode: {
    write(resolver, overwrite = false) {
      const pluginPath = join(resolver.home(), ".config", "opencode", "plugins", "membank.js");

      if (!overwrite && existsSync(pluginPath)) {
        const existing = readFileSync(pluginPath, "utf8");
        if (existing.includes("@membank/cli stop-hook")) {
          return {
            status: "already-configured",
            existing: existing.trim(),
            replacement: newOpencodePlugin(true),
          };
        }
      }

      mkdirSync(dirname(pluginPath), { recursive: true });
      writeFileSync(pluginPath, `${newOpencodePlugin(true)}\n`, "utf8");
      return { status: "written" };
    },
  },
};

export class InjectionHookWriter {
  readonly #resolver: InjectionPathResolver;

  constructor(resolver: InjectionPathResolver = defaultPathResolver) {
    this.#resolver = resolver;
  }

  write(harness: string, overwrite?: boolean): InjectionWriteResult {
    const writer = writers[harness];
    if (!writer) return { status: "not-supported" };
    return writer.write(this.#resolver, overwrite);
  }

  writeStopHook(harness: string, overwrite?: boolean): InjectionWriteResult {
    const writer = stopHookWriters[harness];
    if (!writer) return { status: "not-supported" };
    return writer.write(this.#resolver, overwrite);
  }
}
