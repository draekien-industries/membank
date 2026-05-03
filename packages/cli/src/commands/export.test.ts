import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseManager } from "@membank/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Formatter } from "../formatter.js";
import type { ExportFile } from "./export.js";
import { exportCommand } from "./export.js";

function insertMemory(
  db: DatabaseManager,
  id: string,
  opts?: { content?: string; type?: string; pinned?: boolean }
): void {
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, needs_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      opts?.content ?? "test content",
      opts?.type ?? "fact",
      "[]",
      null,
      0,
      opts?.pinned === true ? 1 : 0,
      0,
      now,
      now
    );

  const zero = Buffer.from(new Float32Array(384).fill(0.1).buffer);
  db.db
    .prepare(
      `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
    )
    .run(zero, id);
}

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

describe("export command — real in-memory SQLite", () => {
  let db: DatabaseManager;
  const humanFormatter = new Formatter(false);
  const jsonFormatter = new Formatter(true);
  let tempFiles: string[] = [];

  function tempPath(name: string): string {
    const p = join(tmpdir(), name);
    tempFiles.push(p);
    return p;
  }

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    tempFiles = [];
  });

  afterEach(() => {
    db.close();
    for (const f of tempFiles) {
      if (existsSync(f)) rmSync(f);
    }
  });

  it("exports memories to specified --output path", () => {
    insertMemory(db, "mem-1", { content: "Use TypeScript", type: "preference" });
    insertMemory(db, "mem-2", { content: "Always test", type: "correction" });

    const outputPath = tempPath("export-test-1.json");
    captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));

    expect(existsSync(outputPath)).toBe(true);
    const file = JSON.parse(readFileSync(outputPath, "utf-8")) as ExportFile;
    expect(file.version).toBe(1);
    expect(typeof file.exportedAt).toBe("string");
    expect(file.memories).toHaveLength(2);
  });

  it("exported file contains all Memory fields", () => {
    insertMemory(db, "mem-3", { content: "Some fact", type: "fact" });

    const outputPath = tempPath("export-test-2.json");
    captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));

    const file = JSON.parse(readFileSync(outputPath, "utf-8")) as ExportFile;
    const rec = file.memories[0];
    expect(rec).toBeDefined();
    expect(rec?.id).toBe("mem-3");
    expect(rec?.content).toBe("Some fact");
    expect(rec?.type).toBe("fact");
    expect(Array.isArray(rec?.tags)).toBe(true);
    expect(typeof rec?.accessCount).toBe("number");
    expect(typeof rec?.pinned).toBe("boolean");
    expect(typeof rec?.needsReview).toBe("boolean");
    expect(typeof rec?.createdAt).toBe("string");
    expect(typeof rec?.updatedAt).toBe("string");
  });

  it("exports embedding as base64 string", () => {
    insertMemory(db, "mem-4");

    const outputPath = tempPath("export-test-3.json");
    captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));

    const file = JSON.parse(readFileSync(outputPath, "utf-8")) as ExportFile;
    const rec = file.memories[0];
    expect(typeof rec?.embedding).toBe("string");
    // base64 should decode to a Float32Array of 384 floats = 1536 bytes
    const buf = Buffer.from(rec?.embedding ?? "", "base64");
    expect(buf.byteLength).toBe(384 * 4);
  });

  it("exports null embedding when no embedding row exists", () => {
    // Insert memory without embedding
    const now = new Date().toISOString();
    db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, needs_review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("mem-noEmbed", "no embedding", "fact", "[]", null, 0, 0, 0, now, now);

    const outputPath = tempPath("export-test-4.json");
    captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));

    const file = JSON.parse(readFileSync(outputPath, "utf-8")) as ExportFile;
    const rec = file.memories.find((m) => m.id === "mem-noEmbed");
    expect(rec?.embedding).toBeNull();
  });

  it("prints human-readable success message", () => {
    insertMemory(db, "mem-5");

    const outputPath = tempPath("export-test-5.json");
    const output = captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));
    expect(output).toContain("Exported 1 memories to");
    expect(output).toContain(outputPath);
  });

  it("prints JSON success message in JSON mode", () => {
    insertMemory(db, "mem-6");

    const outputPath = tempPath("export-test-6.json");
    const output = captureStdout(() => exportCommand(db, jsonFormatter, { output: outputPath }));
    const parsed = JSON.parse(output) as { exported: number; path: string };
    expect(parsed.exported).toBe(1);
    expect(parsed.path).toBe(outputPath);
  });

  it("exports 0 memories when DB is empty", () => {
    const outputPath = tempPath("export-test-7.json");
    captureStdout(() => exportCommand(db, humanFormatter, { output: outputPath }));

    const file = JSON.parse(readFileSync(outputPath, "utf-8")) as ExportFile;
    expect(file.memories).toHaveLength(0);
  });

  it("uses default filename in cwd when no --output given", () => {
    insertMemory(db, "mem-7");

    // We can't easily predict Date.now() so we intercept stdout to get the path
    const outputLines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      outputLines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    };

    let createdPath: string | undefined;
    try {
      exportCommand(db, humanFormatter, {});
      const match = outputLines.join("").match(/membank-export-\d+\.json/);
      if (match) {
        createdPath = join(process.cwd(), match[0]);
        tempFiles.push(createdPath);
      }
    } finally {
      process.stdout.write = orig;
    }

    // The file should exist at cwd with the default name pattern
    expect(createdPath).toBeDefined();
    if (createdPath) {
      expect(existsSync(createdPath)).toBe(true);
    }
  });
});
