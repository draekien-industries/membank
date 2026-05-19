import {
  createMemoryRepository,
  createProjectRepository,
  type DatabaseManager,
} from "@membank/core";
import type { Formatter } from "../../formatter.js";

export function memoryShowCommand(
  id: string,
  db: DatabaseManager,
  formatter: Formatter,
  opts: { version?: number }
): void {
  const repo = createMemoryRepository(db, createProjectRepository(db));

  if (opts.version !== undefined) {
    const v = repo.getVersion(id, opts.version);
    if (v === undefined) {
      formatter.error(`Version ${opts.version} not found for memory: ${id}`);
      process.exit(1);
    }
    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(v)}\n`);
    } else {
      process.stdout.write(`${v.content}\n`);
    }
    return;
  }

  const memory = repo.findById(id);
  if (memory === undefined) {
    formatter.error(`Memory not found: ${id}`);
    process.exit(1);
  }

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify(memory)}\n`);
  } else {
    process.stdout.write(`${memory.content}\n`);
  }
}
