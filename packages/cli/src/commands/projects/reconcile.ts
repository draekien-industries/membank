import {
  createProjectRepository,
  DatabaseManager,
  findWorktreeOrphan,
  type MergeProjectsResult,
  mergeProjects,
  reconcileWorktreeOrphan,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";
import type { PromptHelper } from "../../prompt-helper.js";

function report(result: MergeProjectsResult, formatter: Formatter): void {
  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const noun = result.movedMemories === 1 ? "memory" : "memories";
  process.stdout.write(
    `${chalk.green("✓")} Merged ${chalk.bold(result.source.name)} into ${chalk.bold(result.target.name)} (${result.movedMemories} ${noun} moved)\n`
  );
}

export async function projectsReconcileCommand(
  sourceId: string | undefined,
  targetId: string | undefined,
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  if ((sourceId === undefined) !== (targetId === undefined)) {
    formatter.error("Provide both <sourceId> and <targetId>, or neither to auto-detect.");
    process.exit(1);
  }

  const db = DatabaseManager.open();
  try {
    const projects = createProjectRepository(db);

    if (sourceId !== undefined && targetId !== undefined) {
      const source = projects.getById(sourceId);
      if (source === undefined) {
        formatter.error(`Project not found: ${sourceId}`);
        process.exit(1);
      }
      const target = projects.getById(targetId);
      if (target === undefined) {
        formatter.error(`Project not found: ${targetId}`);
        process.exit(1);
      }
      const confirmed = await prompt.confirm(
        `Merge "${source.name}" into "${target.name}"? Memories and activity move to the target; "${source.name}" is removed.`
      );
      if (!confirmed) return;
      report(mergeProjects(sourceId, targetId, projects), formatter);
      return;
    }

    const orphan = await findWorktreeOrphan(projects);
    if (orphan === null) {
      if (formatter.isJson) {
        process.stdout.write("null\n");
      } else {
        process.stdout.write(chalk.dim("  No orphaned project found for the current worktree.\n"));
      }
      return;
    }

    const confirmed = await prompt.confirm(
      `Merge worktree orphan "${orphan.orphan.name}" into "${orphan.target.name}"?`
    );
    if (!confirmed) return;

    const result = await reconcileWorktreeOrphan(projects);
    if (result === null) {
      formatter.error("Orphan disappeared before reconciliation could complete.");
      process.exit(1);
    }
    report(result, formatter);
  } finally {
    db.close();
  }
}
