import { DatabaseManager } from "@membank/core";
import { seedMemory } from "@membank/core/test-support";
import { beforeEach, describe, expect, it } from "vitest";
import { Formatter } from "../formatter.js";
import { PromptHelper } from "../prompt-helper.js";
import { deleteCommand } from "./delete.js";

function insertMemory(db: DatabaseManager, id: string): void {
  seedMemory(db, {
    id,
    content: "test content",
    type: "fact",
    embedding: new Float32Array(384).fill(0),
  });
}

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

describe("delete command — real in-memory SQLite", () => {
  let db: DatabaseManager;
  const autoConfirmPrompt = new PromptHelper(true);
  const humanFormatter = new Formatter(false);

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
  });

  it("deletes an existing memory and prints success", async () => {
    insertMemory(db, "mem-1");

    const output = await captureStdout(async () => {
      await deleteCommand("mem-1", db, humanFormatter, autoConfirmPrompt);
    });

    expect(output).toContain("Deleted memory: mem-1");

    const row = db.one<{ id: string }>(`SELECT id FROM memories WHERE id = ?`, "mem-1");
    expect(row).toBeUndefined();
  });

  it("prints error and exits 1 when memory not found", async () => {
    let exitCode: number | undefined;
    const originalExit = process.exit.bind(process);
    process.exit = (code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    const stderrOutput = await captureStderr(async () => {
      try {
        await deleteCommand("nonexistent-id", db, humanFormatter, autoConfirmPrompt);
      } catch {
        // process.exit throws in test context
      }
    });

    process.exit = originalExit;

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain("Memory not found: nonexistent-id");
  });

  it("does nothing when confirmation is declined", async () => {
    insertMemory(db, "mem-2");

    const declinePrompt = new PromptHelper(false);
    // Override confirm to return false
    declinePrompt.confirm = async () => false;

    const output = await captureStdout(async () => {
      await deleteCommand("mem-2", db, humanFormatter, declinePrompt);
    });

    expect(output).toBe("");

    const row = db.one<{ id: string }>(`SELECT id FROM memories WHERE id = ?`, "mem-2");
    expect(row).toBeDefined();
  });

  it("--yes flag (autoConfirm: true) skips prompt and deletes", async () => {
    insertMemory(db, "mem-3");

    const output = await captureStdout(async () => {
      await deleteCommand("mem-3", db, humanFormatter, new PromptHelper(true));
    });

    expect(output).toContain("Deleted memory: mem-3");
  });
});
