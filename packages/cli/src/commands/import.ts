import { readFileSync } from "node:fs";
import type { DatabaseManager } from "@membank/core";
import type { Formatter } from "../formatter.js";
import type { PromptHelper } from "../prompt-helper.js";
import { ExportFileSchema } from "../schemas.js";

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

  const parseResult = ExportFileSchema.safeParse(parsed);
  if (!parseResult.success) {
    formatter.error(
      `Invalid export file: ${parseResult.error.issues[0]?.message ?? "unknown error"}`
    );
    process.exit(1);
  }

  const count = parseResult.data.memories.length;

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
    `INSERT OR REPLACE INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertEmbedding = db.db.prepare(
    `INSERT OR REPLACE INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
  );

  const runImport = db.db.transaction(() => {
    for (const rec of parseResult.data.memories) {
      insertMemory.run(
        rec.id,
        rec.content,
        rec.type,
        JSON.stringify(rec.tags ?? []),
        rec.sourceHarness ?? null,
        rec.accessCount ?? 0,
        rec.pinned ? 1 : 0,
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
