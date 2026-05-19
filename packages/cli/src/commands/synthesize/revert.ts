import {
  createSynthesisRepository,
  DatabaseManager,
  GLOBAL_PROJECT_NAME,
  revertSynthesis,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../../formatter.js";
import type { PromptHelper } from "../../prompt-helper.js";
import { resolveScope } from "./resolve-scope.js";

export async function synthesizeRevertCommand(
  version: number,
  opts: { scope?: string },
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
    const resolvedScope = resolveScope(scope, db);
    const repo = createSynthesisRepository(db);

    if (repo.getVersion(resolvedScope, version) === undefined) {
      formatter.error(`Version ${version} not found for scope: ${scope}`);
      process.exit(1);
    }

    const confirmed = await prompt.confirm(
      `Revert synthesis for scope "${scope}" to version ${version}?`
    );
    if (!confirmed) {
      return;
    }

    revertSynthesis(resolvedScope, version, repo);

    process.stdout.write(
      `${chalk.green("✓")} Reverted synthesis for scope ${chalk.dim(scope)} to version ${version}\n`
    );
  } finally {
    db.close();
  }
}
