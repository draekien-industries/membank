import {
  DatabaseManager,
  MIGRATIONS,
  ProjectRepository,
  runScopeToProjectsMigration,
} from "@membank/core";
import type { Formatter } from "../formatter.js";

export async function migrateCommand(
  mode: "list" | "run",
  name: string | undefined,
  formatter: Formatter
): Promise<void> {
  if (mode === "list") {
    if (formatter.isJson) {
      process.stdout.write(
        `${JSON.stringify(MIGRATIONS.map((m) => ({ name: m.name, description: m.description })))}\n`
      );
    } else {
      for (const m of MIGRATIONS) {
        process.stdout.write(`${m.name}\n  ${m.description}\n`);
      }
    }
    return;
  }

  if (name === undefined) {
    formatter.error("Migration name is required for run mode.");
    process.exit(1);
  }

  if (!MIGRATIONS.some((m) => m.name === name)) {
    formatter.error(
      `Unknown migration: "${name}". Available: ${MIGRATIONS.map((m) => m.name).join(", ")}`
    );
    process.exit(1);
  }

  const db = DatabaseManager.open();
  try {
    if (name === "scope-to-projects") {
      const result = await runScopeToProjectsMigration(new ProjectRepository(db));
      if (result === null) {
        formatter.error("No project found for current directory.");
        return;
      }
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else {
        const { oldName, newName, memoryCount } = result;
        process.stdout.write(
          `Found project: ${oldName} (${memoryCount} ${memoryCount === 1 ? "memory" : "memories"})\n`
        );
        process.stdout.write(`Resolved name: ${newName}\n`);
        process.stdout.write(`Renamed → ${newName}\n`);
        process.stdout.write("Done.\n");
      }
    }
  } finally {
    db.close();
  }
}
