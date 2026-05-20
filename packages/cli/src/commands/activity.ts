import type { ActivityEvent, ActivityEventType } from "@membank/core";
import {
  ACTIVITY_EVENT_TYPE_VALUES,
  ActivityEventTypeSchema,
  createActivityRepository,
  DatabaseManager,
  GLOBAL_SCOPE_HASH,
  listEvents,
  resolveProject,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../formatter.js";
import { truncate } from "../formatter.js";

const SNIPPET_LENGTH = 120;

const EVENT_COLORS: Record<ActivityEventType, (s: string) => string> = {
  "memory.created": chalk.green,
  "memory.updated": chalk.cyan,
  "memory.deleted": chalk.red,
  "memory.flagged": chalk.yellow,
  "memory.queried": chalk.dim,
};

function formatEventDetail(event: ActivityEvent): string | null {
  const p = event.payload;
  const getString = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : undefined);
  const getNumber = (key: string) => (typeof p[key] === "number" ? (p[key] as number) : undefined);

  switch (event.eventType) {
    case "memory.created":
    case "memory.updated": {
      const snippet = getString("contentSnapshot");
      if (snippet === undefined) return null;
      return chalk.dim(`    ${truncate(snippet, SNIPPET_LENGTH).replace(/\n/g, " ↵ ")}`);
    }
    case "memory.deleted": {
      const snippet = getString("contentSnapshot");
      if (snippet === undefined) return null;
      return chalk.dim(`    (deleted) ${truncate(snippet, SNIPPET_LENGTH).replace(/\n/g, " ↵ ")}`);
    }
    case "memory.queried": {
      const query = getString("query");
      if (query === undefined) return null;
      return chalk.dim(`    "${truncate(query, SNIPPET_LENGTH)}"`);
    }
    case "memory.flagged": {
      const sim = getNumber("similarity");
      const conflictId = getString("conflictingMemoryId");
      if (sim === undefined) return null;
      const pct = `${Math.round(sim * 100)}% similar`;
      const conflict = conflictId !== undefined ? ` · conflict: ${conflictId.slice(0, 8)}` : "";
      return chalk.dim(`    ${pct}${conflict}`);
    }
  }
}

function formatEvent(event: ActivityEvent): string {
  const color = EVENT_COLORS[event.eventType] ?? chalk.white;
  const tag = color(event.eventType.padEnd(16));
  const time = new Date(event.createdAt).toLocaleTimeString();
  const id = event.memoryId !== null ? chalk.dim(` [${event.memoryId.slice(0, 8)}]`) : "";
  const header = `  ${tag}  ${time}${id}`;
  const detail = formatEventDetail(event);
  return detail !== null ? `${header}\n${detail}` : header;
}

export async function activityCommand(
  options: {
    type?: string;
    since?: string;
    memoryId?: string;
    limit?: string;
    global?: boolean;
    scope?: string;
    json?: boolean;
  },
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const activityRepo = createActivityRepository(db);

    let scope: string | undefined;
    if (options.scope !== undefined) {
      scope = options.scope;
    } else if (options.global === true) {
      scope = GLOBAL_SCOPE_HASH;
    } else {
      const project = await resolveProject();
      scope = project.hash;
    }

    let validatedType: ActivityEventType | undefined;
    if (options.type !== undefined) {
      const parsed = ActivityEventTypeSchema.safeParse(options.type);
      if (!parsed.success) {
        formatter.error(
          `Invalid event type: "${options.type}". Valid values: ${ACTIVITY_EVENT_TYPE_VALUES.join(", ")}`
        );
        process.exit(1);
      }
      validatedType = parsed.data;
    }

    const events = listEvents(
      {
        scope,
        ...(validatedType !== undefined && { type: validatedType }),
        ...(options.since !== undefined && { since: options.since }),
        limit: options.limit !== undefined ? parseInt(options.limit, 10) : 50,
      },
      activityRepo
    );

    if (formatter.isJson) {
      process.stdout.write(`${JSON.stringify(events)}\n`);
      return;
    }

    if (events.length === 0) {
      process.stdout.write(chalk.dim("  No activity found.\n"));
      return;
    }

    let lastDay = "";
    for (const event of events) {
      const day = event.createdAt.slice(0, 10);
      if (day !== lastDay) {
        lastDay = day;
        process.stdout.write(`\n${chalk.bold(day)}\n`);
      }
      process.stdout.write(`${formatEvent(event)}\n`);
    }
    process.stdout.write("\n");
  } finally {
    db.close();
  }
}
