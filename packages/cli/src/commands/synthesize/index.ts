import type { MemoryType, Synthesis } from "@membank/core";
import {
  createProjectRepository,
  createSynthesisRepository,
  DatabaseManager,
  GLOBAL_PROJECT_NAME,
  GLOBAL_SCOPE_HASH,
  MEMORY_TYPE_VALUES,
} from "@membank/core";
import { runSynthesis } from "@membank/mcp";
import type { Formatter } from "../../formatter.js";
import { resolveScope } from "./resolve-scope.js";

export async function synthesizeRunCommand(
  opts: { scope?: string },
  formatter: Formatter
): Promise<void> {
  const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
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

export function synthesizeShowCommand(
  opts: { scope?: string; version?: number; memoryType?: MemoryType },
  formatter: Formatter
): void {
  const db = DatabaseManager.open();
  try {
    const scope = opts.scope ?? GLOBAL_PROJECT_NAME;
    const resolvedScope = resolveScope(scope, db);
    const repo = createSynthesisRepository(db);

    if (opts.version !== undefined) {
      if (opts.memoryType === undefined) {
        formatter.error("--type is required when showing a specific version");
        process.exit(1);
      }
      const version = repo.getVersion(resolvedScope, opts.memoryType, opts.version);
      if (version === undefined) {
        if (formatter.isJson) {
          process.stdout.write(`${JSON.stringify(null)}\n`);
        } else {
          process.stdout.write(
            `Version ${opts.version} not found for scope: ${scope} (type: ${opts.memoryType})\n`
          );
        }
        return;
      }
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(version)}\n`);
      } else {
        process.stdout.write(
          `\nScope: ${resolvedScope} (type ${version.memoryType}, version ${version.version})\n`
        );
        process.stdout.write(`Synthesized: ${new Date(version.synthesizedAt).toLocaleString()}\n`);
        process.stdout.write(`Archived: ${new Date(version.createdAt).toLocaleString()}\n`);
        process.stdout.write(`\n${version.content}\n\n`);
      }
      return;
    }

    const types = opts.memoryType !== undefined ? [opts.memoryType] : MEMORY_TYPE_VALUES;
    const syntheses: Synthesis[] = [];
    for (const type of types) {
      const synthesis = repo.getSynthesis(resolvedScope, type);
      if (synthesis !== undefined) syntheses.push(synthesis);
    }

    if (syntheses.length === 0) {
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(opts.memoryType !== undefined ? null : [])}\n`);
      } else {
        process.stdout.write(`No synthesis found for scope: ${scope}\n`);
      }
      return;
    }

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(syntheses)}\n`);
      return;
    }

    for (const synthesis of syntheses) {
      process.stdout.write(`\nScope: ${synthesis.scope} (type ${synthesis.memoryType})\n`);
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
      const displayScope =
        project?.name ?? (s.scope === GLOBAL_SCOPE_HASH ? GLOBAL_PROJECT_NAME : s.scope);
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
