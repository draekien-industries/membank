import { readFileSync } from "node:fs";
import type { DatabaseManager } from "@membank/core";
import type { Formatter } from "../formatter.js";
import type { PromptHelper } from "../prompt-helper.js";
import type { ExportFile, ExportRecord } from "./export.js";

const MEMORY_TYPES = new Set(["correction", "preference", "decision", "learning", "fact"]);

function isValidRecord(r: unknown): r is ExportRecord {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    rec.id.length > 0 &&
    typeof rec.content === "string" &&
    typeof rec.type === "string" &&
    MEMORY_TYPES.has(rec.type) &&
    typeof rec.scope === "string" &&
    rec.scope.length > 0
  );
}

function isExportFile(parsed: unknown): parsed is ExportFile {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return obj.version === 1 && Array.isArray(obj.memories);
}

export async function importCommand(
  filePath: string,
  db: DatabaseManager,
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    formatter.error(`Cannot read file: ${filePath}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    formatter.error(`Invalid JSON in file: ${filePath}`);
    process.exit(1);
  }

  if (!isExportFile(parsed)) {
    formatter.error(`Invalid export file format: expected version 1 and memories array`);
    process.exit(1);
  }

  const invalidIndex = parsed.memories.findIndex((r) => !isValidRecord(r));
  if (invalidIndex !== -1) {
    formatter.error(
      `Invalid memory record at index ${invalidIndex}: must have id, content, type, and scope`
    );
    process.exit(1);
  }

  const count = parsed.memories.length;

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ found: count })}\n`);
  } else {
    process.stdout.write(`Found ${count} memories to import.\n`);
  }

  const confirmed = await prompt.confirm("Import?");
  if (!confirmed) {
    return;
  }

  const insertMemory = db.db.prepare(
    `INSERT OR REPLACE INTO memories (id, content, type, tags, scope, source, access_count, pinned, needs_review, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertEmbedding = db.db.prepare(
    `INSERT OR REPLACE INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
  );

  const runImport = db.db.transaction(() => {
    for (const rec of parsed.memories) {
      insertMemory.run(
        rec.id,
        rec.content,
        rec.type,
        JSON.stringify(rec.tags ?? []),
        rec.scope,
        rec.sourceHarness ?? null,
        rec.accessCount ?? 0,
        rec.pinned ? 1 : 0,
        rec.needsReview ? 1 : 0,
        rec.createdAt ?? new Date().toISOString(),
        rec.updatedAt ?? new Date().toISOString()
      );

      if (rec.embedding !== null && rec.embedding !== undefined) {
        const buf = Buffer.from(rec.embedding, "base64");
        insertEmbedding.run(buf, rec.id);
      }
    }
  });

  runImport();

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ imported: count })}\n`);
  } else {
    process.stdout.write(`Imported ${count} memories.\n`);
  }
}
