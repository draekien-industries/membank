import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseManager, type MemoryType } from "@membank/core";
import {
  GLOBAL_PROJECT_ID,
  GLOBAL_SCOPE_HASH,
  linkMemoryToProject,
  seedActivityEvent,
  seedMemory,
  seedProject,
  seedReviewEvent,
  seedSynthesis,
  seedSynthesisVersion,
} from "@membank/core/test-support";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_DIR = join(PACKAGE_ROOT, ".dev-db");
const DB_PATH = join(DB_DIR, "memory.db");

const MEMBANK_SCOPE = "a1b2c3d4e5f60718";
const SIDEQUEST_SCOPE = "b2c3d4e5f6071829";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

interface DevMemory {
  content: string;
  type: MemoryType;
  pinned?: boolean;
  ageDays: number;
  tags?: string[];
}

const GLOBAL_MEMORIES: DevMemory[] = [
  {
    content:
      "Always use conventional commit message format for commits and PR titles: a type prefix, a colon, then a subject under 72 characters.",
    type: "preference",
    pinned: true,
    ageDays: 40,
  },
  {
    content:
      "Use Sonnet or Haiku for exploration and search-heavy work; reserve Opus for synthesis and high-impact decisions.",
    type: "preference",
    pinned: true,
    ageDays: 32,
  },
  {
    content:
      "Never define React subcomponents inside a parent's render body — each render creates a new function identity, which remounts the subtree and loses focus state.",
    type: "learning",
    ageDays: 18,
  },
];

const MEMBANK_MEMORIES: DevMemory[] = [
  {
    content:
      "The vector extension sqlite-vec is external in every tsdown config and must never be bundled.",
    type: "fact",
    ageDays: 55,
    tags: ["build"],
  },
  {
    content:
      "Don't disable a tool's feature to work around a parsing problem — check for a config option first. Biome 2.x parses Tailwind v4 syntax via css.parser.tailwindDirectives.",
    type: "correction",
    ageDays: 26,
    tags: ["tooling", "biome"],
  },
  {
    content:
      "Chose node:sqlite over better-sqlite3 so the package ships without a native build step, which raises the floor to Node 24.",
    type: "decision",
    pinned: true,
    ageDays: 21,
  },
  {
    content:
      "The dashboard talks to core through @membank/core/client in browser code; the root entry pulls in Node-only native modules.",
    type: "fact",
    ageDays: 14,
    tags: ["dashboard"],
  },
  {
    content:
      "Synthesis runs behind a debounce loop in the MCP server, so a dashboard-triggered run has no engine reclaiming its claim if that process dies.",
    type: "learning",
    ageDays: 9,
  },
  {
    content: "Prefer tonal layering to box shadows anywhere in the dashboard UI.",
    type: "preference",
    ageDays: 6,
    tags: ["design"],
  },
  {
    content:
      "Turborepo enforces the build order, so core must be rebuilt before the CLI picks up a core change.",
    type: "fact",
    ageDays: 3,
  },
];

const SIDEQUEST_MEMORIES: DevMemory[] = [
  {
    content: "This project pins pnpm through corepack; do not install it globally.",
    type: "fact",
    ageDays: 12,
  },
  {
    content: "Prefers Vitest over Jest for every new package in this workspace.",
    type: "preference",
    ageDays: 7,
  },
];

function seedMemories(
  db: DatabaseManager,
  memories: DevMemory[],
  projectId: string,
  scope: string
): string[] {
  return memories.map((memory) => {
    const createdAt = daysAgo(memory.ageDays);
    const id = seedMemory(db, {
      content: memory.content,
      type: memory.type,
      pinned: memory.pinned ?? false,
      tags: memory.tags ?? [],
      createdAt,
      projectId,
    });
    seedActivityEvent(db, {
      projectHash: scope,
      eventType: "memory_saved",
      memoryId: id,
      createdAt,
    });
    return id;
  });
}

rmSync(DB_DIR, { recursive: true, force: true });
mkdirSync(DB_DIR, { recursive: true });

const db = DatabaseManager.open(DB_PATH);

seedProject(db, { id: GLOBAL_PROJECT_ID, name: "global", scopeHash: GLOBAL_SCOPE_HASH });
const membankId = seedProject(db, {
  name: "membank",
  scopeHash: MEMBANK_SCOPE,
  origin: "git@github.com:draekien-industries/membank.git",
});
const sidequestId = seedProject(db, {
  name: "sidequest",
  scopeHash: SIDEQUEST_SCOPE,
  origin: "git@github.com:draekien-industries/sidequest.git",
});

const globalIds = seedMemories(db, GLOBAL_MEMORIES, GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH);
const membankIds = seedMemories(db, MEMBANK_MEMORIES, membankId, MEMBANK_SCOPE);
seedMemories(db, SIDEQUEST_MEMORIES, sidequestId, SIDEQUEST_SCOPE);

const sharedMemory = globalIds.at(-1);
if (sharedMemory !== undefined) linkMemoryToProject(db, sharedMemory, membankId);

const flagged = membankIds[1];
if (flagged !== undefined) {
  seedReviewEvent(db, {
    memoryId: flagged,
    similarity: 0.89,
    conflictContentSnapshot:
      "Disable the CSS linter when a parser cannot read the stylesheet syntax.",
    createdAt: daysAgo(2),
  });
}

seedSynthesis(db, {
  scope: MEMBANK_SCOPE,
  memoryType: "fact",
  content:
    "sqlite-vec stays external in tsdown; the dashboard imports @membank/core/client in browser code; Turborepo owns build order, so core rebuilds before the CLI sees a change.",
  synthesizedAt: daysAgo(1),
});
seedSynthesisVersion(db, {
  scope: MEMBANK_SCOPE,
  memoryType: "fact",
  version: 1,
  content: "sqlite-vec stays external in tsdown. The dashboard uses the client entry.",
  synthesizedAt: daysAgo(4),
});

// Issue #111: a claim older than the engine's reclaim timeout with no process behind it,
// so the panel shows "Stuck" and the unlock button has something to release.
seedSynthesis(db, {
  scope: MEMBANK_SCOPE,
  memoryType: "preference",
  content: "",
  synthesizedAt: minutesAgo(7),
  inFlightSince: minutesAgo(7),
});

db.close();

process.stdout.write(`Seeded ${DB_PATH}\n`);
process.stdout.write("Point the dev server at it:\n");
process.stdout.write('  pwsh: $env:MEMBANK_DB_PATH="$PWD/.dev-db/memory.db"\n');
process.stdout.write('  bash: export MEMBANK_DB_PATH="$PWD/.dev-db/memory.db"\n');
