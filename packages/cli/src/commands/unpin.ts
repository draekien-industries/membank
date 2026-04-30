import { DatabaseManager } from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../formatter.js";

export function unpinCommand(id: string, formatter: Formatter, db?: DatabaseManager): void {
  const ownDb = db === undefined;
  const resolvedDb = db ?? DatabaseManager.open();
  try {
    const result = resolvedDb.db
      .prepare<[string], { id: string }>("SELECT id FROM memories WHERE id = ?")
      .get(id);

    if (result === undefined) {
      formatter.error(`Memory not found: ${id}`);
      process.exit(2);
    } else {
      resolvedDb.db.prepare("UPDATE memories SET pinned = 0 WHERE id = ?").run(id);
      process.stdout.write(`${chalk.green("✓")} Unpinned: ${chalk.dim(id)}\n`);
    }
  } finally {
    if (ownDb) resolvedDb.close();
  }
}
