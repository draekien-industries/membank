import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MutableJsonObjectSchema } from "../schemas.js";

export function readJson(path: string): Record<string, unknown> {
  try {
    return MutableJsonObjectSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

export function writeJsonAtomic(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(mkdtempSync(join(tmpdir(), "membank-")), "cfg.json");
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
