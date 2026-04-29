const PRELUDE_CHUNKS = [
  "Looking at the file structure, I notice we have a typical monorepo with packages under packages/.",
  "Reading through the recent commits to understand what's changed.",
  "The test output shows 14 passing, 2 failing. Let me dig into the failures.",
  "Checking the build artifacts in dist/ — they look stale, last modified yesterday.",
  "The TypeScript config extends the root with strict mode and noUncheckedIndexedAccess.",
  "Running pnpm typecheck across the workspace now to catch any cross-package drift.",
  "Found a circular dependency between core and mcp — investigating the import graph.",
  "The lint output flags a few biome warnings about unused imports in the test files.",
  "Inspecting the database schema migrations in core/migrations — three pending entries.",
  "The CI logs show the linux-arm64 job timing out at the embedding cache warm-up step.",
  "Pulling the latest from main to make sure I'm working against current state.",
  "Tracing the call path from the CLI command into the MCP server initialization.",
  "Reading packages/core/src/embedding/service.ts — uses transformers.js with bge-small-en.",
  "The query engine builds a SQL query with vector similarity and applies type/scope filters.",
  "Looking at the dedup repository code — cosine similarity computed via sqlite-vec extension.",
  "The session context builder pulls stats and pinned memories filtered by global vs project scope.",
  "Reviewing the harness writers — each one targets a different config file location.",
  "The hook payload format is JSON for claude-code, plain text for codex and opencode.",
  "Found the test fixture that pins the embedding model version for reproducible tests.",
  "The CI matrix runs node 24 on linux/macos/windows; pnpm version is locked via corepack.",
];

const TECH_DETAIL_CHUNKS = [
  "The error stack trace points to line 247 of repository.ts where the prepared statement is invoked.",
  "Cosine similarity threshold is 0.92 for auto-overwrite and 0.75-0.92 for needs_review flagging.",
  "Memory types are ordered correction > preference > decision > learning > fact in the enum.",
  "The session injection runs only on SessionStart now — UserPromptSubmit and PostToolUseFailure were dropped.",
  "Project scope is derived from `git remote get-url origin` hashed, fallback to cwd hash.",
  "The MCP server speaks stdio transport and exposes five tools with JSON Schema input definitions.",
  "Better-sqlite3 is loaded as a native module — declared external in tsdown so it's not bundled.",
  "Sqlite-vec is the vector extension — version 0.1.x — loaded via load_extension at db open.",
  "Embeddings are 384-dim float32 stored as BLOB and indexed by sqlite-vec virtual table.",
  "The transformers.js model cache lives at ~/.membank/models/ and is downloaded on first run.",
  "Turbo config caches build outputs by content hash; cache: false on dev/clean tasks.",
  "Biome 2.x replaces ESLint+Prettier; rules live in biome.json at repo root.",
  "Lefthook runs biome check on staged files pre-commit; no other git hooks configured.",
  "The version PR branch is changeset-release/main and is auto-rebased by the changesets action.",
  "Prerelease snapshots tag npm with rc dist-tag; stable releases go to latest.",
];

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateFiller(seed: number, targetChars: number): string {
  const rng = mulberry32(seed);
  const chunks = [...PRELUDE_CHUNKS, ...TECH_DETAIL_CHUNKS];
  const out: string[] = [];
  let total = 0;
  while (total < targetChars) {
    const idx = Math.floor(rng() * chunks.length);
    const chunk = chunks[idx];
    if (chunk === undefined) continue;
    out.push(chunk);
    total += chunk.length + 1;
  }
  return out.join(" ");
}
