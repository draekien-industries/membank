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

export type InjectionWriteStatus = "written" | "already-configured" | "not-supported";
export type InjectionWriteResult = { status: InjectionWriteStatus };

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

function containsMembankInject(hooks: unknown): boolean {
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) =>
      typeof h === "object" &&
      h !== null &&
      (("command" in h &&
        typeof h.command === "string" &&
        h.command.includes("@membank/cli inject")) ||
        ("bash" in h && typeof h.bash === "string" && h.bash.includes("@membank/cli inject")))
  );
}

interface HarnessInjectionWriter {
  write(resolver: InjectionPathResolver): InjectionWriteResult;
}

const writers: Record<string, HarnessInjectionWriter> = {
  "claude-code": {
    write(resolver) {
      const cfgPath = join(resolver.home(), ".claude", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const sessionStart = hooks?.["SessionStart"];

      if (
        Array.isArray(sessionStart) &&
        containsMembankInject(
          (sessionStart as { hooks?: unknown }[]).flatMap((g) =>
            Array.isArray(g.hooks) ? g.hooks : []
          )
        )
      ) {
        return { status: "already-configured" };
      }

      const existingSessionStart = Array.isArray(sessionStart) ? sessionStart : [];
      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...existingSessionStart,
            {
              matcher: "",
              hooks: [
                { type: "command", command: "npx @membank/cli inject --harness claude-code" },
              ],
            },
          ],
        },
      });
      return { status: "written" };
    },
  },

  "copilot-cli": {
    write(resolver) {
      const cfgPath = join(resolver.home(), ".copilot", "settings.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const sessionStart = hooks?.["sessionStart"];

      if (Array.isArray(sessionStart) && containsMembankInject(sessionStart)) {
        return { status: "already-configured" };
      }

      const existingSessionStart = Array.isArray(sessionStart) ? sessionStart : [];
      writeJsonAtomic(cfgPath, {
        version: (cfg.version as number | undefined) ?? 1,
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          sessionStart: [
            ...existingSessionStart,
            {
              type: "command",
              bash: "npx @membank/cli inject --harness copilot-cli",
              timeoutSec: 30,
            },
          ],
        },
      });
      return { status: "written" };
    },
  },

  codex: {
    write(resolver) {
      const cfgPath = join(resolver.home(), ".codex", "hooks.json");
      const cfg = readJson(cfgPath);

      const hooks = cfg.hooks as Record<string, unknown> | undefined;
      const sessionStart = hooks?.["SessionStart"];

      if (
        Array.isArray(sessionStart) &&
        containsMembankInject(
          (sessionStart as { hooks?: unknown }[]).flatMap((g) =>
            Array.isArray(g.hooks) ? g.hooks : []
          )
        )
      ) {
        return { status: "already-configured" };
      }

      const existingSessionStart = Array.isArray(sessionStart) ? sessionStart : [];
      writeJsonAtomic(cfgPath, {
        ...cfg,
        hooks: {
          ...(hooks ?? {}),
          SessionStart: [
            ...existingSessionStart,
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
      return { status: "written" };
    },
  },

  opencode: {
    write(resolver) {
      const pluginPath = join(resolver.home(), ".config", "opencode", "plugins", "membank.js");

      if (existsSync(pluginPath)) {
        const existing = readFileSync(pluginPath, "utf8");
        if (existing.includes("@membank/cli inject")) {
          return { status: "already-configured" };
        }
      }

      mkdirSync(dirname(pluginPath), { recursive: true });
      const content = [
        "export default {",
        "  hooks: {",
        '    "session.start": async ({ $ }) => {',
        "      return await $`npx @membank/cli inject`.text();",
        "    },",
        "  },",
        "};",
        "",
      ].join("\n");
      writeFileSync(pluginPath, content, "utf8");
      return { status: "written" };
    },
  },
};

export const INJECTION_HARNESSES = Object.keys(writers) as (keyof typeof writers)[];

export class InjectionHookWriter {
  readonly #resolver: InjectionPathResolver;

  constructor(resolver: InjectionPathResolver = defaultPathResolver) {
    this.#resolver = resolver;
  }

  write(harness: string): InjectionWriteResult {
    const writer = writers[harness];
    if (!writer) return { status: "not-supported" };
    return writer.write(this.#resolver);
  }
}
