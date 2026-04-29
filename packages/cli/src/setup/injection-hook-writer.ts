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

// Removes hook groups that contain any membank inject command (any --event variant).
function filterOutMembank(groups: unknown[]): unknown[] {
  return groups.filter((g) => !containsMembankInject(getHooksArray(g)));
}

// Removes flat hook entries that contain any membank inject command.
function filterOutMembankFlat(hooks: unknown[]): unknown[] {
  return hooks.filter((h) => !containsMembankInject([h]));
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
      const existingSessionStart = Array.isArray(hooks?.SessionStart) ? hooks.SessionStart : [];
      const innerHooks = existingSessionStart.flatMap(getHooksArray);

      if (!overwrite && containsMembankInject(innerHooks)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(innerHooks),
          replacement: this.replacement,
        };
      }

      const filteredSessionStart = overwrite
        ? filterOutMembank(existingSessionStart)
        : existingSessionStart;

      const existingUserPrompt = Array.isArray(hooks?.UserPromptSubmit)
        ? hooks.UserPromptSubmit
        : [];
      const existingToolFailure = Array.isArray(hooks?.PostToolUseFailure)
        ? hooks.PostToolUseFailure
        : [];

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...filteredSessionStart,
            {
              matcher: "",
              hooks: [
                { type: "command", command: "npx @membank/cli inject --harness claude-code" },
              ],
            },
          ],
          UserPromptSubmit: [
            ...filterOutMembank(existingUserPrompt),
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
            ...filterOutMembank(existingToolFailure),
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
      return { status: "written" };
    },
  },

  "copilot-cli": {
    replacement: "npx @membank/cli inject --harness copilot-cli",
    write(resolver, overwrite = false) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const existingSessionStart = Array.isArray(hooks?.sessionStart) ? hooks.sessionStart : [];

      if (!overwrite && containsMembankInject(existingSessionStart)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(existingSessionStart),
          replacement: this.replacement,
        };
      }

      const filteredSessionStart = overwrite
        ? filterOutMembankFlat(existingSessionStart)
        : existingSessionStart;

      const existingUserPrompt = Array.isArray(hooks?.userPromptSubmitted)
        ? hooks.userPromptSubmitted
        : [];
      const existingToolFailure = Array.isArray(hooks?.postToolUseFailure)
        ? hooks.postToolUseFailure
        : [];

      writeJsonAtomic(cfgPath, {
        version: (cfg.version as number | undefined) ?? 1,
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          sessionStart: [
            ...filteredSessionStart,
            {
              type: "command",
              bash: "npx @membank/cli inject --harness copilot-cli",
              timeoutSec: 30,
            },
          ],
          userPromptSubmitted: [
            ...filterOutMembankFlat(existingUserPrompt),
            {
              type: "command",
              bash: "npx @membank/cli inject --event user-prompt --harness copilot-cli",
              timeoutSec: 30,
            },
          ],
          postToolUseFailure: [
            ...filterOutMembankFlat(existingToolFailure),
            {
              type: "command",
              bash: "npx @membank/cli inject --event tool-failure --harness copilot-cli",
              timeoutSec: 30,
            },
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
      const existingSessionStart = Array.isArray(hooks?.SessionStart) ? hooks.SessionStart : [];
      const innerHooks = existingSessionStart.flatMap(getHooksArray);

      if (!overwrite && containsMembankInject(innerHooks)) {
        return {
          status: "already-configured",
          existing: extractInjectCommand(innerHooks),
          replacement: this.replacement,
        };
      }

      const filteredSessionStart = overwrite
        ? filterOutMembank(existingSessionStart)
        : existingSessionStart;

      const existingUserPrompt = Array.isArray(hooks?.UserPromptSubmit)
        ? hooks.UserPromptSubmit
        : [];
      const existingToolFailure = Array.isArray(hooks?.PostToolUse) ? hooks.PostToolUse : [];

      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...filteredSessionStart,
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
          UserPromptSubmit: [
            ...filterOutMembank(existingUserPrompt),
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
            ...filterOutMembank(existingToolFailure),
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

  write(harness: string, overwrite?: boolean): InjectionWriteResult {
    const writer = writers[harness];
    if (!writer) return { status: "not-supported" };
    return writer.write(this.#resolver, overwrite);
  }
}
