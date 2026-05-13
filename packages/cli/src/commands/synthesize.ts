import { DatabaseManager } from "@membank/core";
import { runSynthesis } from "@membank/mcp";
import type { Formatter } from "../formatter.js";

interface SynthesisRow {
  id: string;
  scope: string;
  content: string;
  source_memory_hash: string | null;
  synthesized_at: string | null;
  expires_at: string | null;
  in_flight_since: string | null;
  created_at: string;
  updated_at: string;
}

function hasSynthesesTable(db: DatabaseManager): boolean {
  const row = db.db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='syntheses'"
    )
    .get();
  return row !== undefined;
}

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
    if (!hasSynthesesTable(db)) {
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(null)}\n`);
      } else {
        process.stdout.write("No synthesis data available.\n");
      }
      return;
    }

    const scope = opts.scope ?? "global";
    const row = db.db
      .prepare<[string], SynthesisRow>(
        "SELECT * FROM syntheses WHERE scope = ? ORDER BY synthesized_at DESC LIMIT 1"
      )
      .get(scope);

    if (row === undefined) {
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify(null)}\n`);
      } else {
        process.stdout.write(`No synthesis found for scope: ${scope}\n`);
      }
      return;
    }

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(row)}\n`);
    } else {
      process.stdout.write(`\nScope: ${row.scope}\n`);
      if (row.synthesized_at !== null) {
        process.stdout.write(`Synthesized: ${new Date(row.synthesized_at).toLocaleString()}\n`);
      }
      if (row.expires_at !== null) {
        process.stdout.write(`Expires: ${new Date(row.expires_at).toLocaleString()}\n`);
      }
      if (row.in_flight_since !== null) {
        process.stdout.write(
          `In-flight since: ${new Date(row.in_flight_since).toLocaleString()}\n`
        );
      }
      process.stdout.write(`\n${row.content}\n\n`);
    }
  } finally {
    db.close();
  }
}

export function synthesizeStatusCommand(formatter: Formatter): void {
  const db = DatabaseManager.open();
  try {
    if (!hasSynthesesTable(db)) {
      if (formatter.isJson) {
        process.stdout.write(`${JSON.stringify([])}\n`);
      } else {
        process.stdout.write("No synthesis data available.\n");
      }
      return;
    }

    const rows = db.db.prepare<[], SynthesisRow>("SELECT * FROM syntheses ORDER BY scope").all();

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }

    if (rows.length === 0) {
      process.stdout.write("No syntheses found.\n");
      return;
    }

    process.stdout.write("\n");
    for (const row of rows) {
      const inFlight = row.in_flight_since !== null ? " [in-flight]" : "";
      const synthesized =
        row.synthesized_at !== null ? new Date(row.synthesized_at).toLocaleString() : "(never)";
      const expires =
        row.expires_at !== null ? new Date(row.expires_at).toLocaleString() : "(none)";
      process.stdout.write(`  ${row.scope}${inFlight}\n`);
      process.stdout.write(`    synthesized_at: ${synthesized}\n`);
      process.stdout.write(`    expires_at:     ${expires}\n`);
    }
    process.stdout.write("\n");
  } finally {
    db.close();
  }
}
