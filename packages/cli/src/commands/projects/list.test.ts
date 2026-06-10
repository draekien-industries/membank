import { createProjectRepository, DatabaseManager } from "@membank/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../../formatter.js";
import { projectsListCommand } from "./list.js";

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

describe("projects list command", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    vi.spyOn(DatabaseManager, "open").mockReturnValue(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints projects with their origin", () => {
    createProjectRepository(db).upsertByHash("aaaaaaaaaaaaaaaa", "alpha", "/repos/alpha");

    const output = captureStdout(() => {
      projectsListCommand(new Formatter(false));
    });

    expect(output).toContain("alpha");
    expect(output).toContain("/repos/alpha");
  });

  it("emits JSON with memory counts when --json is set", () => {
    const projects = createProjectRepository(db);
    const project = projects.upsertByHash("aaaaaaaaaaaaaaaa", "alpha", "/repos/alpha");
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
    projects.addAssociation("mem-1", project.id);

    const output = captureStdout(() => {
      projectsListCommand(new Formatter(true));
    });

    const parsed = JSON.parse(output) as Array<{ scopeHash: string; memoryCount: number }>;
    const alpha = parsed.find((p) => p.scopeHash === "aaaaaaaaaaaaaaaa");
    expect(alpha?.memoryCount).toBe(1);
  });
});
