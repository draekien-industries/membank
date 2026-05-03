import type { EmbeddingService } from "@membank/core";
import { DatabaseManager } from "@membank/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../formatter.js";
import { addCommand } from "./add.js";

function unitVec(dim: number, size = 384): Float32Array {
  const v = new Float32Array(size).fill(0);
  v[dim] = 1;
  return v;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
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

describe("add command integration — real in-memory SQLite", () => {
  let db: DatabaseManager;
  let embeddingStub: EmbeddingService;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));
  });

  it("saves and prints the saved record with success message (human mode)", async () => {
    const formatter = new Formatter(false);
    const output = await captureStdout(() =>
      addCommand("Use TypeScript strict mode", { type: "preference" }, formatter, db, embeddingStub)
    );

    expect(output).toContain("preference");
    expect(output).toContain("Use TypeScript strict mode");
  });

  it("saves and prints JSON in JSON mode", async () => {
    const formatter = new Formatter(true);
    const output = await captureStdout(() =>
      addCommand("Use TypeScript strict mode", { type: "preference" }, formatter, db, embeddingStub)
    );

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.content).toBe("Use TypeScript strict mode");
    expect(parsed.type).toBe("preference");
  });

  it("--tags splits on comma and saves as array", async () => {
    const formatter = new Formatter(true);
    const output = await captureStdout(() =>
      addCommand(
        "naming conventions",
        { type: "preference", tags: "typescript,naming" },
        formatter,
        db,
        embeddingStub
      )
    );

    const parsed = JSON.parse(output) as { tags: string[] };
    expect(parsed.tags).toEqual(["typescript", "naming"]);
  });

  it("--global saves with no project association", async () => {
    const formatter = new Formatter(true);
    const output = await captureStdout(() =>
      addCommand("global rule", { type: "fact", global: true }, formatter, db, embeddingStub)
    );

    const parsed = JSON.parse(output) as { projects: unknown[] };
    expect(parsed.projects).toEqual([]);
  });

  it("saved record has an id field", async () => {
    const formatter = new Formatter(true);
    const output = await captureStdout(() =>
      addCommand("some decision", { type: "decision" }, formatter, db, embeddingStub)
    );

    const parsed = JSON.parse(output) as { id: string };
    expect(typeof parsed.id).toBe("string");
    expect(parsed.id.length).toBeGreaterThan(0);
  });

  it("default projects is empty array when no scope specified", async () => {
    const formatter = new Formatter(true);
    const output = await captureStdout(() =>
      addCommand("a learning", { type: "learning" }, formatter, db, embeddingStub)
    );

    const parsed = JSON.parse(output) as { projects: unknown[] };
    expect(Array.isArray(parsed.projects)).toBe(true);
  });
});
