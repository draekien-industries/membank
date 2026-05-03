import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseManager } from "@membank/core";
import type { Formatter } from "../formatter.js";

interface ExportRow {
  id: string;
  content: string;
  type: string;
  tags: string;
  source: string | null;
  access_count: number;
  pinned: number;
  needs_review: number;
  created_at: string;
  updated_at: string;
  embedding: Buffer | null;
}

export interface ExportRecord {
  id: string;
  content: string;
  type: string;
  tags: string[];
  sourceHarness: string | null;
  accessCount: number;
  pinned: boolean;
  needsReview: boolean;
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
  const rows = db.db
    .prepare<[], ExportRow>(
      `SELECT m.*, e.embedding FROM memories m LEFT JOIN embeddings e ON e.rowid = m.rowid ORDER BY m.created_at DESC`
    )
    .all();

  const memories: ExportRecord[] = rows.map((row) => ({
    id: row.id,
    content: row.content,
    type: row.type,
    tags: JSON.parse(row.tags) as string[],
    sourceHarness: row.source,
    accessCount: row.access_count,
    pinned: row.pinned !== 0,
    needsReview: row.needs_review !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    embedding: row.embedding !== null ? Buffer.from(row.embedding).toString("base64") : null,
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
