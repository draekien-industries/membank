import {
  createProjectRepository,
  createSynthesisRepository,
  DatabaseManager,
  GLOBAL_SCOPE_HASH,
} from "@membank/core";
import { runSynthesis } from "@membank/mcp";
import type { Formatter } from "../formatter.js";

export async function synthesizeRunCommand(
  opts: { scope?: string },
  formatter: Formatter
): Promise<void> {
  const scope = opts.scope ?? "global";
  if (!formatter.isJson) {
    process.stdout.write(`Running synthesis for scope: ${scope}\n`);
  }
  const content = await runSynthesis(scope);
  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ scope, content })}\n`);
  } else {
    process.stdout.write(`\nSynthesis complete for scope: ${scope}\n\n${content}\n\n`);
  }
}

export function synthesizeShowCommand(opts: { scope?: string }, formatter: Formatter): void {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? "global";
    let resolvedScope = scope;
    if (scope === "global") {
      resolvedScope = GLOBAL_SCOPE_HASH;
    } else if (!/^[0-9a-f]{16}$/.test(scope)) {
      const project = createProjectRepository(db).getByName(scope);
      if (project !== undefined) {
        resolvedScope = project.scopeHash;
      }
    }

    const synthesis = createSynthesisRepository(db).getSynthesis(resolvedScope);

    if (synthesis === undefined) {
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(null)}\n`);
      } else {
        process.stdout.write(`No synthesis found for scope: ${scope}\n`);
      }
      return;
    }

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(synthesis)}\n`);
    } else {
      process.stdout.write(`\nScope: ${synthesis.scope}\n`);
      process.stdout.write(`Synthesized: ${new Date(synthesis.synthesizedAt).toLocaleString()}\n`);
      process.stdout.write(`Expires: ${new Date(synthesis.expiresAt).toLocaleString()}\n`);
      if (synthesis.inFlightSince !== null) {
        process.stdout.write(
          `In-flight since: ${new Date(synthesis.inFlightSince).toLocaleString()}\n`
        );
      }
      process.stdout.write(`\n${synthesis.content}\n\n`);
    }
  } finally {
    db.close();
  }
}

export function synthesizeStatusCommand(formatter: Formatter): void {
  const db = DatabaseManager.open();
  try {
    const syntheses = createSynthesisRepository(db).listAll();
    const projectRepo = createProjectRepository(db);

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(syntheses)}\n`);
      return;
    }

    if (syntheses.length === 0) {
      process.stdout.write("No syntheses found.\n");
      return;
    }

    process.stdout.write("\n");
    for (const s of syntheses) {
      const project = s.scope !== GLOBAL_SCOPE_HASH ? projectRepo.getByHash(s.scope) : undefined;
      const displayScope = project?.name ?? (s.scope === GLOBAL_SCOPE_HASH ? "global" : s.scope);
      const inFlight = s.inFlightSince !== null ? " [in-flight]" : "";
      const synthesized = new Date(s.synthesizedAt).toLocaleString();
      const expires = new Date(s.expiresAt).toLocaleString();
      process.stdout.write(`  ${displayScope}${inFlight}\n`);
      process.stdout.write(`    synthesized_at: ${synthesized}\n`);
      process.stdout.write(`    expires_at:     ${expires}\n`);
    }
    process.stdout.write("\n");
  } finally {
    db.close();
  }
}
