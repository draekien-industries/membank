import { createProjectRepository, DatabaseManager } from "@membank/core";
import chalk from "chalk";
import Table from "cli-table3";
import type { Formatter } from "../../formatter.js";
import { truncate } from "../../formatter.js";

export function projectsListCommand(formatter: Formatter): void {
  const db = DatabaseManager.open();
  try {
    const projects = createProjectRepository(db);
    const rows = projects.list().map((project) => ({
      ...project,
      memoryCount: projects.countMemories(project.id),
    }));

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }

    if (rows.length === 0) {
      process.stdout.write(chalk.dim("  No projects found.\n"));
      return;
    }

    const table = new Table({
      head: ["ID", "Name", "Memories", "Origin"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    });

    for (const p of rows) {
      table.push([
        chalk.dim(p.id),
        p.name,
        String(p.memoryCount),
        p.origin !== null ? truncate(p.origin, 40) : chalk.dim("(none)"),
      ]);
    }

    process.stdout.write(`\n${table.toString()}\n\n`);
  } finally {
    db.close();
  }
}
