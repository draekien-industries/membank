import { createProjectRepository, DatabaseManager } from "@membank/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../../formatter.js";
import { PromptHelper } from "../../prompt-helper.js";
import { projectsReconcileCommand } from "./reconcile.js";

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  return fn()
    .then(() => chunks.join(""))
    .finally(() => {
      process.stdout.write = original;
    });
}

function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  return fn()
    .then(() => chunks.join(""))
    .finally(() => {
      process.stderr.write = original;
    });
}

const HASH_A = "aaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbb";

describe("projects reconcile command", () => {
  let db: DatabaseManager;
  const autoConfirm = new PromptHelper(true);
  const humanFormatter = new Formatter(false);

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    vi.spyOn(DatabaseManager, "open").mockReturnValue(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedExplicitMerge(): { sourceId: string; targetId: string } {
    const projects = createProjectRepository(db);
    const source = projects.upsertByHash(HASH_A, "orphan");
    const target = projects.upsertByHash(HASH_B, "parent");
    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "mem-1",
        "c",
        "fact",
        "[]",
        null,
        0,
        0,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
    projects.addAssociation("mem-1", source.id);
    return { sourceId: source.id, targetId: target.id };
  }

  it("merges the source into the target with both ids", async () => {
    const { sourceId, targetId } = seedExplicitMerge();

    const output = await captureStdout(async () => {
      await projectsReconcileCommand(sourceId, targetId, humanFormatter, autoConfirm);
    });

    expect(output).toContain("Merged");
    expect(output).toContain("orphan");
    expect(output).toContain("parent");
    expect(output).toContain("1 memory moved");
  });

  it("does nothing when confirmation is declined", async () => {
    const { sourceId, targetId } = seedExplicitMerge();
    const declinePrompt = new PromptHelper(false);
    declinePrompt.confirm = async () => false;

    const output = await captureStdout(async () => {
      await projectsReconcileCommand(sourceId, targetId, humanFormatter, declinePrompt);
    });

    expect(output).toBe("");
  });

  it("errors and exits 1 when only one id is provided", async () => {
    let exitCode: number | undefined;
    const originalExit = process.exit.bind(process);
    process.exit = (code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    const stderr = await captureStderr(async () => {
      try {
        await projectsReconcileCommand(HASH_A, undefined, humanFormatter, autoConfirm);
      } catch {
        // process.exit throws in test context
      }
    });

    process.exit = originalExit;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Provide both");
  });
});
