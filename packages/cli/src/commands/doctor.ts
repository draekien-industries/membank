import {
  createExtractionRunRepository,
  createProjectRepository,
  createRejectedCandidateRepository,
  DatabaseManager,
  DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  findSplitScopePairs,
  mergeProjects,
  type SplitScopePair,
} from "@membank/core";
import chalk from "chalk";
import type { Formatter } from "../formatter.js";
import type { PromptHelper } from "../prompt-helper.js";
import { AUTO_MEMORY_EXPLANATION } from "../setup/auto-memory-gate.js";
import { ClaudeSettings } from "../setup/claude-settings.js";

const FAILURE_RATE_WINDOW_DAYS = 30;
const FAILURE_RATE_WARN = 0.1;

export interface DoctorCheck {
  id: "auto-memory" | "stale-runs" | "split-scope" | "extraction-failures" | "admission-gate";
  status: "ok" | "warn";
  summary: string;
  detail: string[];
  fixed: boolean;
}

function ok(id: DoctorCheck["id"], summary: string): DoctorCheck {
  return { id, status: "ok", summary, detail: [], fixed: false };
}

function warn(id: DoctorCheck["id"], summary: string, detail: string[] = []): DoctorCheck {
  return { id, status: "warn", summary, detail, fixed: false };
}

function describePair(pair: SplitScopePair, memoryCount: (id: string) => number): string {
  return (
    `${pair.local.name}: ${memoryCount(pair.local.id)} memories under ${pair.local.origin} ` +
    `→ ${memoryCount(pair.remote.id)} under ${pair.remote.origin}`
  );
}

async function checkAutoMemory(fix: boolean, prompt: PromptHelper): Promise<DoctorCheck> {
  const settings = new ClaudeSettings();
  if (settings.autoMemoryStatus() === "disabled") {
    return ok("auto-memory", "Claude Code native auto-memory is off");
  }

  const check = warn("auto-memory", "Claude Code native auto-memory is competing with membank", [
    ...AUTO_MEMORY_EXPLANATION,
  ]);
  if (!fix) return check;

  const confirmed = await prompt.confirm(`Set "autoMemoryEnabled": false in ${settings.path}?`);
  if (!confirmed) return check;

  settings.disableAutoMemory();
  return { ...check, fixed: true };
}

export async function doctorCommand(
  opts: { fix?: boolean },
  formatter: Formatter,
  prompt: PromptHelper
): Promise<void> {
  const fix = opts.fix === true;
  const checks: DoctorCheck[] = [await checkAutoMemory(fix, prompt)];

  const db = DatabaseManager.open();
  try {
    const runs = createExtractionRunRepository(db);
    const projects = createProjectRepository(db);
    const now = new Date();
    const since = new Date(now.getTime() - FAILURE_RATE_WINDOW_DAYS * 86_400_000);
    const stats = runs.stats(now, since, DEFAULT_IN_FLIGHT_TIMEOUT_MS);

    if (stats.staleInFlight === 0) {
      checks.push(ok("stale-runs", "No stuck extraction runs"));
    } else {
      const staleCheck = warn(
        "stale-runs",
        `${stats.staleInFlight} extraction run(s) stuck in_flight`,
        ["Nothing retries a dead session id, so these block re-extraction of those sessions."]
      );
      if (fix) {
        runs.reapStale(now, DEFAULT_IN_FLIGHT_TIMEOUT_MS);
        staleCheck.fixed = true;
      }
      checks.push(staleCheck);
    }

    const pairs = findSplitScopePairs(projects.list());
    if (pairs.length === 0) {
      checks.push(ok("split-scope", "No split project scopes"));
    } else {
      const memoryCount = (id: string): number => projects.countMemories(id);
      const splitCheck = warn(
        "split-scope",
        `${pairs.length} project(s) appear split between a local path and a git remote`,
        pairs.map((pair) => describePair(pair, memoryCount))
      );
      if (fix) {
        for (const pair of pairs) {
          const confirmed = await prompt.confirm(
            `Merge "${pair.local.name}" (${pair.local.origin}) into "${pair.remote.name}" (${pair.remote.origin})?`
          );
          if (!confirmed) continue;
          mergeProjects(pair.local.id, pair.remote.id, projects);
          splitCheck.fixed = true;
        }
      }
      checks.push(splitCheck);
    }

    const rejections = createRejectedCandidateRepository(db).countByClause(since);
    const totalRejected = rejections.reduce((sum, r) => sum + r.count, 0);
    checks.push({
      id: "admission-gate",
      status: "ok",
      summary: `Admission gate rejected ${totalRejected} candidate(s) over ${FAILURE_RATE_WINDOW_DAYS} days`,
      detail: rejections.map((r) => `${r.clause}: ${r.count}`),
      fixed: false,
    });

    const rate = stats.total === 0 ? 0 : stats.failed / stats.total;
    const rateSummary = `Extraction failures: ${stats.failed}/${stats.total} over ${FAILURE_RATE_WINDOW_DAYS} days`;
    checks.push(
      rate > FAILURE_RATE_WARN
        ? warn("extraction-failures", rateSummary, [
            "Run with MEMBANK_EXTRACTION_DEBUG=true to see why the agent is failing.",
          ])
        : ok("extraction-failures", rateSummary)
    );
  } finally {
    db.close();
  }

  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ checks })}\n`);
    return;
  }

  process.stdout.write("\n");
  for (const check of checks) {
    const icon = check.status === "ok" ? chalk.green("✓") : chalk.yellow("⚠");
    const fixedLabel = check.fixed ? chalk.green(" (fixed)") : "";
    process.stdout.write(`  ${icon} ${check.summary}${fixedLabel}\n`);
    for (const line of check.detail) {
      process.stdout.write(`      ${chalk.dim(line)}\n`);
    }
  }

  const warnings = checks.filter((c) => c.status === "warn" && !c.fixed).length;
  if (warnings > 0 && !fix) {
    process.stdout.write(`\n  ${chalk.dim("Run  membank doctor --fix  to apply fixes.")}\n`);
  }
  process.stdout.write("\n");
}
