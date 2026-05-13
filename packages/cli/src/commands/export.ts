import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseManager } from "@membank/core";
import { createMemoryRepository, createProjectRepository } from "@membank/core";
import type { Formatter } from "../formatter.js";

export interface ExportRecord {
  id: string;
  content: string;
  type: string;
  tags: string[];
  sourceHarness: string | null;
  accessCount: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  embedding: string | null;
}

export interface ExportFile {
  version: 1;
  exportedAt: string;
  memories: ExportRecord[];
}

export function exportCommand(
  db: DatabaseManager,
  formatter: Formatter,
  opts: { output?: string }
): void {
  const repo = createMemoryRepository(db, createProjectRepository(db));
  const rawRecords = repo.exportAll();

  const memories: ExportRecord[] = rawRecords.map((rec) => ({
    id: rec.id,
    content: rec.content,
    type: rec.type,
    tags: rec.tags,
    sourceHarness: rec.sourceHarness,
    accessCount: rec.accessCount,
    pinned: rec.pinned,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    embedding:
      rec.embedding !== null
        ? Buffer.from(
            rec.embedding.buffer,
            rec.embedding.byteOffset,
            rec.embedding.byteLength
          ).toString("base64")
        : null,
  }));

  const exportedAt = new Date().toISOString();
  const data: ExportFile = { version: 1, exportedAt, memories };

  const outputPath = opts.output ?? join(process.cwd(), `membank-export-${Date.now()}.json`);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ exported: memories.length, path: outputPath })}\n`);
  } else {
    process.stdout.write(`Exported ${memories.length} memories to ${outputPath}\n`);
  }
}
