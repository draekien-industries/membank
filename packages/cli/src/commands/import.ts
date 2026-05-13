import { readFileSync } from "node:fs";
import type { DatabaseManager, MemoryExportRecord } from "@membank/core";
import { createMemoryRepository, createProjectRepository } from "@membank/core";
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

  const records: MemoryExportRecord[] = parseResult.data.memories.map((rec) => ({
    id: rec.id,
    content: rec.content,
    type: rec.type,
    tags: rec.tags,
    sourceHarness: rec.sourceHarness ?? null,
    accessCount: rec.accessCount ?? 0,
    pinned: rec.pinned ?? false,
    createdAt: rec.createdAt ?? new Date().toISOString(),
    updatedAt: rec.updatedAt ?? new Date().toISOString(),
    embedding: (() => {
      if (rec.embedding == null) return null;
      const buf = Buffer.from(rec.embedding, "base64");
      return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    })(),
  }));

  const repo = createMemoryRepository(db, createProjectRepository(db));
  repo.importAll(records);

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ imported: count })}\n`);
  } else {
    process.stdout.write(`Imported ${count} memories.\n`);
  }
}
