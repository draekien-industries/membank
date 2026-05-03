import { DatabaseManager, ProjectRepository, resolveProject } from "@membank/core";
import type { Formatter } from "../formatter.js";

interface Migration {
  name: string;
  description: string;
  run(db: DatabaseManager, formatter: Formatter): Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    name: "scope-to-projects",
    description:
      "Rename the auto-migrated project for the current directory from its generic hash-derived name to the resolved repo/directory name.",
    async run(db, formatter) {
      const resolved = await resolveProject();
      const projects = new ProjectRepository(db);
      const project = projects.getByHash(resolved.hash);

      if (project === undefined) {
        formatter.error("No project found for current directory.");
        return;
      }

      const oldName = project.name;
      const count = projects.countMemories(project.id);
      projects.rename(project.id, resolved.name);

      if (formatter.isJson) {
        process.stdout.write(
          `${JSON.stringify({ migration: "scope-to-projects", oldName, newName: resolved.name, memoryCount: count })}\n`
        );
      } else {
        process.stdout.write(
          `Found project: ${oldName} (${count} ${count === 1 ? "memory" : "memories"})\n`
        );
        process.stdout.write(`Resolved name: ${resolved.name}\n`);
        process.stdout.write(`Renamed → ${resolved.name}\n`);
        process.stdout.write("Done.\n");
      }
    },
  },
];

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

  const migration = MIGRATIONS.find((m) => m.name === name);
  if (migration === undefined) {
    formatter.error(
      `Unknown migration: "${name}". Available: ${MIGRATIONS.map((m) => m.name).join(", ")}`
    );
    process.exit(1);
  }

  const db = DatabaseManager.open();
  try {
    await migration.run(db, formatter);
  } finally {
    db.close();
  }
}
