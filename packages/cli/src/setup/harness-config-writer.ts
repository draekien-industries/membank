import { join } from "node:path";
import { MaybeJsonObjectSchema, SETUP_HARNESS_VALUES } from "../schemas.js";
import { type CommandRunner, execFileNoThrow } from "../utils/execFileNoThrow.js";
import { readJson, writeJsonAtomic } from "../utils/json.js";
import type { HarnessName } from "./harness-detector.js";

export type WriteResult = { status: "written" | "already-configured" };
export type HarnessPreview = { configPath: string | null; cliCommand: string | null };

export class CommandError extends Error {
  readonly command: string;
  constructor(message: string, command: string) {
    super(message);
    this.name = "CommandError";
    this.command = command;
  }
}

export interface PathResolver {
  home: () => string;
  cwd: () => string;
}

const defaultPathResolver: PathResolver = {
  home: () => {
    const h = process.env.HOME ?? process.env.USERPROFILE;
    if (!h) throw new Error("Cannot determine home directory");
    return h;
  },
  cwd: () => process.cwd(),
};

function hasKey(container: unknown, key: string): boolean {
  return container !== null && typeof container === "object" && Object.hasOwn(container, key);
}

function assertCliFound(
  result: { exitCode: number; stderr: string },
  cli: string,
  command: string
): void {
  if (result.exitCode === 127) {
    throw new CommandError(`${cli} CLI not found — install ${cli} first`, command);
  }
}

function jsonContainsStalePattern(value: unknown): boolean {
  return JSON.stringify(value).includes("@membank/cli");
}

const MEMBANK_NPX_ARGS = ["npx", "-y", "@membank/mcp"] as const;

interface HarnessWriter {
  preview(resolver: PathResolver): HarnessPreview;
  write(
    resolver: PathResolver,
    run: CommandRunner,
    opts: { overwrite?: boolean }
  ): Promise<WriteResult>;
  isStale(resolver: PathResolver, run: CommandRunner): Promise<boolean>;
}

const writers: Record<string, HarnessWriter> = {
  "claude-code": {
    preview(resolver) {
      return {
        configPath: join(resolver.home(), ".claude.json"),
        cliCommand: "claude mcp add --scope user membank -- npx -y @membank/mcp",
      };
    },
    async write(resolver, run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".claude.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg.mcpServers, "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      if (configured) {
        const removeArgs = ["mcp", "remove", "--scope", "user", "membank"] as const;
        const removeCmd = `claude ${removeArgs.join(" ")}`;
        const remove = await run("claude", [...removeArgs]);
        assertCliFound(remove, "claude", removeCmd);
        if (remove.exitCode !== 0) {
          throw new CommandError(`claude mcp remove failed: ${remove.stderr}`, removeCmd);
        }
      }

      const addArgs = [
        "mcp",
        "add",
        "--scope",
        "user",
        "membank",
        "--",
        ...MEMBANK_NPX_ARGS,
      ] as const;
      const addCmd = `claude ${addArgs.join(" ")}`;
      const add = await run("claude", [...addArgs]);
      assertCliFound(add, "claude", addCmd);
      if (add.exitCode !== 0) {
        throw new CommandError(`claude mcp add failed: ${add.stderr || add.stdout}`, addCmd);
      }
      return { status: "written" };
    },
    async isStale(resolver) {
      const cfg = readJson(join(resolver.home(), ".claude.json"));
      return hasKey(cfg.mcpServers, "membank") && jsonContainsStalePattern(cfg.mcpServers);
    },
  },

  copilot: {
    preview(resolver) {
      return {
        configPath: join(resolver.home(), ".copilot", "mcp-config.json"),
        cliCommand: null,
      };
    },
    async write(resolver, _run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".copilot", "mcp-config.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg.mcpServers, "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      writeJsonAtomic(cfgPath, {
        ...cfg,
        mcpServers: {
          ...MaybeJsonObjectSchema.parse(cfg.mcpServers),
          membank: { command: "npx", args: ["-y", "@membank/mcp"] },
        },
      });
      return { status: "written" };
    },
    async isStale(resolver) {
      const cfg = readJson(join(resolver.home(), ".copilot", "mcp-config.json"));
      return hasKey(cfg.mcpServers, "membank") && jsonContainsStalePattern(cfg.mcpServers);
    },
  },

  codex: {
    preview(_resolver) {
      return {
        configPath: null,
        cliCommand: "codex mcp add membank -- npx -y @membank/mcp",
      };
    },
    async write(_resolver, run, { overwrite = false } = {}) {
      const listCmd = "codex mcp list";
      const list = await run("codex", ["mcp", "list"]);
      assertCliFound(list, "codex", listCmd);
      const configured = list.exitCode === 0 && list.stdout.includes("membank");

      if (configured && !overwrite) return { status: "already-configured" };

      if (configured) {
        const removeArgs = ["mcp", "remove", "membank"] as const;
        const removeCmd = `codex ${removeArgs.join(" ")}`;
        const remove = await run("codex", [...removeArgs]);
        assertCliFound(remove, "codex", removeCmd);
        if (remove.exitCode !== 0) {
          throw new CommandError(`codex mcp remove failed: ${remove.stderr}`, removeCmd);
        }
      }

      const addArgs = ["mcp", "add", "membank", "--", ...MEMBANK_NPX_ARGS] as const;
      const addCmd = `codex ${addArgs.join(" ")}`;
      const add = await run("codex", [...addArgs]);
      assertCliFound(add, "codex", addCmd);
      if (add.exitCode !== 0) {
        throw new CommandError(`codex mcp add failed: ${add.stderr || add.stdout}`, addCmd);
      }
      return { status: "written" };
    },
    async isStale(_resolver, run) {
      const list = await run("codex", ["mcp", "list"]);
      return (
        list.exitCode === 0 &&
        list.stdout.includes("membank") &&
        list.stdout.includes("@membank/cli")
      );
    },
  },

  opencode: {
    preview(resolver) {
      return {
        configPath: join(resolver.home(), ".config", "opencode", "opencode.json"),
        cliCommand: null,
      };
    },
    async write(resolver, _run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".config", "opencode", "opencode.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg.mcp, "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      writeJsonAtomic(cfgPath, {
        ...cfg,
        mcp: {
          ...MaybeJsonObjectSchema.parse(cfg.mcp),
          // OpenCode requires type:"local" and command as an array.
          membank: { type: "local", command: ["npx", "-y", "@membank/mcp"] },
        },
      });
      return { status: "written" };
    },
    async isStale(resolver) {
      const cfg = readJson(join(resolver.home(), ".config", "opencode", "opencode.json"));
      return hasKey(cfg.mcp, "membank") && jsonContainsStalePattern(cfg.mcp);
    },
  },
};

export const SUPPORTED_HARNESSES = SETUP_HARNESS_VALUES satisfies readonly HarnessName[];

export class HarnessConfigWriter {
  readonly #resolver: PathResolver;
  readonly #run: CommandRunner;

  constructor(resolver: PathResolver = defaultPathResolver, run: CommandRunner = execFileNoThrow) {
    this.#resolver = resolver;
    this.#run = run;
  }

  preview(harness: string): HarnessPreview {
    const writer = writers[harness];
    if (!writer) throw new Error(`Unknown harness: ${harness}`);
    return writer.preview(this.#resolver);
  }

  async write(
    harness: string,
    { overwrite = false }: { overwrite?: boolean } = {}
  ): Promise<WriteResult> {
    const writer = writers[harness];
    if (!writer) throw new Error(`Unknown harness: ${harness}`);
    return writer.write(this.#resolver, this.#run, { overwrite });
  }

  async isStale(harness: string): Promise<boolean> {
    const writer = writers[harness];
    if (!writer) return false;
    try {
      return await writer.isStale(this.#resolver, this.#run);
    } catch {
      return false;
    }
  }
}
