import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type CommandRunner, execFileNoThrow } from "../utils/execFileNoThrow.js";

export type WriteResult = { status: "written" | "already-configured" };

export interface PathResolver {
  home: () => string;
  cwd: () => string;
}

const defaultPathResolver: PathResolver = {
  home: () => {
    const h = process.env["HOME"] ?? process.env["USERPROFILE"];
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

// Throws a user-friendly error if the CLI was not found in PATH.
function assertCliFound(result: { exitCode: number; stderr: string }, cli: string): void {
  if (result.exitCode === 127) {
    throw new Error(`${cli} CLI not found — install ${cli} first`);
  }
}

const MEMBANK_NPX_ARGS = ["npx", "@membank/cli@latest", "--mcp"] as const;

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
      const configured = hasKey(cfg["mcpServers"], "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      if (configured) {
        const remove = await run("claude", ["mcp", "remove", "--scope", "user", "membank"]);
        assertCliFound(remove, "claude");
        if (remove.exitCode !== 0) {
          throw new Error(`claude mcp remove failed: ${remove.stderr}`);
        }
      }

      const add = await run("claude", [
        "mcp",
        "add",
        "--scope",
        "user",
        "membank",
        "--",
        ...MEMBANK_NPX_ARGS,
      ]);
      assertCliFound(add, "claude");
      if (add.exitCode !== 0) {
        throw new Error(`claude mcp add failed: ${add.stderr || add.stdout}`);
      }
      return { status: "written" };
    },
  },

  vscode: {
    async write(resolver, run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.cwd(), ".vscode", "mcp.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg["servers"], "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      if (configured) {
        // No native remove command — update the JSON file directly for overwrites.
        writeJsonAtomic(cfgPath, {
          ...cfg,
          servers: {
            ...(cfg["servers"] as Record<string, unknown> | undefined),
            membank: { command: "npx", args: ["@membank/cli@latest", "--mcp"] },
          },
        });
        return { status: "written" };
      }

      const payload = JSON.stringify({
        name: "membank",
        command: "npx",
        args: ["@membank/cli@latest", "--mcp"],
      });
      const result = await run("code", ["--folder-uri", resolver.cwd(), "--add-mcp", payload]);
      assertCliFound(result, "code");
      if (result.exitCode !== 0) {
        throw new Error(`code --add-mcp failed: ${result.stderr || result.stdout}`);
      }
      return { status: "written" };
    },
  },

  codex: {
    async write(_resolver, run, { overwrite = false } = {}) {
      const list = await run("codex", ["mcp", "list"]);
      assertCliFound(list, "codex");
      const configured = list.exitCode === 0 && list.stdout.includes("membank");

      if (configured && !overwrite) return { status: "already-configured" };

      if (configured) {
        const remove = await run("codex", ["mcp", "remove", "membank"]);
        assertCliFound(remove, "codex");
        if (remove.exitCode !== 0) {
          throw new Error(`codex mcp remove failed: ${remove.stderr}`);
        }
      }

      const add = await run("codex", ["mcp", "add", "membank", "--", ...MEMBANK_NPX_ARGS]);
      assertCliFound(add, "codex");
      if (add.exitCode !== 0) {
        throw new Error(`codex mcp add failed: ${add.stderr || add.stdout}`);
      }
      return { status: "written" };
    },
  },

  opencode: {
    async write(resolver, _run, { overwrite = false } = {}) {
      const cfgPath = join(resolver.home(), ".config", "opencode", "opencode.json");
      const cfg = readJson(cfgPath);
      const configured = hasKey(cfg["mcp"], "membank");

      if (configured && !overwrite) return { status: "already-configured" };

      writeJsonAtomic(cfgPath, {
        ...cfg,
        mcp: {
          ...(cfg["mcp"] as Record<string, unknown> | undefined),
          // OpenCode requires type:"local" and command as an array.
          membank: { type: "local", command: ["npx", "@membank/cli@latest", "--mcp"] },
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
