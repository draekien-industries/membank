import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type WriteResult = { status: "written" | "already-configured" };

// Injectable path resolver — defaults to home-relative and cwd-relative paths.
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

// Shared MCP entry value (same shape for most harnesses)
const MEMBANK_ENTRY = { command: "npx", args: ["@membank/cli", "--mcp"] } as const;

// Read existing JSON from a file, returning an empty object when missing.
function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Write JSON to `path` atomically via a sibling temp file + rename.
function writeJsonAtomic(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(mkdtempSync(join(tmpdir(), "membank-")), "cfg.json");
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

// Check whether a nested key inside a container object already points to the
// membank entry (we only need to verify the key exists — content may drift).
function hasKey(container: unknown, key: string): boolean {
  return (
    container !== null &&
    typeof container === "object" &&
    key in (container as Record<string, unknown>)
  );
}

export interface HarnessWriter {
  configPath: (resolver: PathResolver) => string;
  isConfigured: (config: Record<string, unknown>) => boolean;
  merge: (config: Record<string, unknown>) => Record<string, unknown>;
}

const writers: Record<string, HarnessWriter> = {
  "claude-code": {
    configPath: (r) => join(r.home(), ".claude", "settings.json"),
    isConfigured: (cfg) => hasKey(cfg["mcpServers"], "membank"),
    merge: (cfg) => ({
      ...cfg,
      mcpServers: {
        ...(cfg["mcpServers"] as Record<string, unknown> | undefined),
        membank: MEMBANK_ENTRY,
      },
    }),
  },

  vscode: {
    configPath: (r) => join(r.cwd(), ".vscode", "mcp.json"),
    isConfigured: (cfg) => hasKey(cfg["servers"], "membank"),
    merge: (cfg) => ({
      ...cfg,
      servers: {
        ...(cfg["servers"] as Record<string, unknown> | undefined),
        membank: MEMBANK_ENTRY,
      },
    }),
  },

  codex: {
    configPath: (r) => join(r.home(), ".codex", "config.json"),
    isConfigured: (cfg) => hasKey(cfg["mcpServers"], "membank"),
    merge: (cfg) => ({
      ...cfg,
      mcpServers: {
        ...(cfg["mcpServers"] as Record<string, unknown> | undefined),
        membank: MEMBANK_ENTRY,
      },
    }),
  },

  opencode: {
    configPath: (r) => join(r.home(), ".config", "opencode", "config.json"),
    isConfigured: (cfg) => hasKey(cfg["mcp"], "membank"),
    merge: (cfg) => ({
      ...cfg,
      mcp: {
        ...(cfg["mcp"] as Record<string, unknown> | undefined),
        membank: MEMBANK_ENTRY,
      },
    }),
  },
};

export const SUPPORTED_HARNESSES = Object.keys(writers) as (keyof typeof writers)[];

export class HarnessConfigWriter {
  readonly #resolver: PathResolver;

  constructor(resolver: PathResolver = defaultPathResolver) {
    this.#resolver = resolver;
  }

  write(harness: string, { overwrite = false }: { overwrite?: boolean } = {}): WriteResult {
    const writer = writers[harness];
    if (!writer) throw new Error(`Unknown harness: ${harness}`);

    const path = writer.configPath(this.#resolver);
    const existing = readJson(path);

    if (!overwrite && writer.isConfigured(existing)) {
      return { status: "already-configured" };
    }

    const merged = writer.merge(existing);
    writeJsonAtomic(path, merged);
    return { status: "written" };
  }
}
