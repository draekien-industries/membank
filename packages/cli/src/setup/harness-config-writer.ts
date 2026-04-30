import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type CommandRunner, execFileNoThrow } from "../utils/execFileNoThrow.js";

export type WriteResult = { status: "written" | "already-configured" };

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

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonAtomic(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(mkdtempSync(join(tmpdir(), "membank-")), "cfg.json");
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

function hasKey(container: unknown, key: string): boolean {
  return (
    container !== null &&
    typeof container === "object" &&
    key in (container as Record<string, unknown>)
  );
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

const MEMBANK_NPX_ARGS = ["npx", "-y", "@membank/cli", "--mcp"] as const;

interface HarnessWriter {
  write(
    resolver: PathResolver,
    run: CommandRunner,
    opts: { overwrite?: boolean }
  ): Promise<WriteResult>;
}

const writers: Record<string, HarnessWriter> = {
  "claude-code": {
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
  },

  copilot: {
    async write(resolver, _run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".copilot", "mcp-config.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg.mcpServers, "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      writeJsonAtomic(cfgPath, {
        ...cfg,
        mcpServers: {
          ...(cfg.mcpServers as Record<string, unknown> | undefined),
          membank: { command: "npx", args: ["-y", "@membank/cli", "--mcp"] },
        },
      });
      return { status: "written" };
    },
  },

  codex: {
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
  },

  opencode: {
    async write(resolver, _run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".config", "opencode", "opencode.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg.mcp, "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      writeJsonAtomic(cfgPath, {
        ...cfg,
        mcp: {
          ...(cfg.mcp as Record<string, unknown> | undefined),
          // OpenCode requires type:"local" and command as an array.
          membank: { type: "local", command: ["npx", "-y", "@membank/cli", "--mcp"] },
        },
      });
      return { status: "written" };
    },
  },
};

export const SUPPORTED_HARNESSES = Object.keys(writers) as (keyof typeof writers)[];

export class HarnessConfigWriter {
  readonly #resolver: PathResolver;
  readonly #run: CommandRunner;

  constructor(resolver: PathResolver = defaultPathResolver, run: CommandRunner = execFileNoThrow) {
    this.#resolver = resolver;
    this.#run = run;
  }

  async write(
    harness: string,
    { overwrite = false }: { overwrite?: boolean } = {}
  ): Promise<WriteResult> {
    const writer = writers[harness];
    if (!writer) throw new Error(`Unknown harness: ${harness}`);
    return writer.write(this.#resolver, this.#run, { overwrite });
  }
}
