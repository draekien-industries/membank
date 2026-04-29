#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { config as loadEnv } from "dotenv";
import pLimit from "p-limit";
import { emitReport, loadRuns, summarizeForConsole } from "./report.js";
import { runOne } from "./runner.js";
import { SCENARIOS } from "./scenarios/index.js";
import { buildRollups, pickWinners } from "./scoring/aggregate.js";
import { judgeRun } from "./scoring/judge.js";
import { applyRules, computeTotal } from "./scoring/rubric.js";
import type { HarnessId, PinState, PromptId, RawRun } from "./types.js";
import { HARNESSES, PIN_STATES, PROMPT_IDS } from "./types.js";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(PKG_DIR, ".env") });
loadEnv({ path: resolve(PKG_DIR, "..", "..", ".env") });

const RESULTS_DIR = resolve(PKG_DIR, "results");

interface SweepOptions {
  prompts: string;
  harnesses: string;
  pinStates: string;
  scenarios?: string;
  reps: string;
  concurrency: string;
  outDir?: string;
  noJudge?: boolean;
  emitReport?: boolean;
}

function parseList<T extends string>(input: string, allowed: readonly T[], label: string): T[] {
  const items = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of items) {
    if (!(allowed as readonly string[]).includes(item)) {
      throw new Error(`Unknown ${label}: ${item}. Allowed: ${allowed.join(", ")}`);
    }
  }
  return items as T[];
}

interface RunGridArgs {
  prompts: PromptId[];
  harnesses: HarnessId[];
  pinStates: PinState[];
  scenarioIds: string[];
  reps: number;
  concurrency: number;
  outDir: string;
  doJudge: boolean;
  fileLabel: string;
  emitReportAfter: boolean;
}

async function runGrid(args: RunGridArgs): Promise<{ jsonlPath: string; runs: RawRun[] }> {
  const {
    prompts,
    harnesses,
    pinStates,
    scenarioIds,
    reps,
    concurrency,
    outDir,
    doJudge,
    fileLabel,
    emitReportAfter,
  } = args;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonlPath = resolve(outDir, `runs-${fileLabel}-${iso}.jsonl`);
  writeFileSync(jsonlPath, "", "utf8");

  const cells: Array<{
    promptId: PromptId;
    scenarioId: string;
    harness: HarnessId;
    pinState: PinState;
    rep: number;
  }> = [];
  for (const promptId of prompts) {
    for (const scenarioId of scenarioIds) {
      for (const harness of harnesses) {
        for (const pinState of pinStates) {
          for (let rep = 0; rep < reps; rep++) {
            cells.push({ promptId, scenarioId, harness, pinState, rep });
          }
        }
      }
    }
  }

  console.log(
    `Running ${cells.length} cells (concurrency=${concurrency}, judge=${doJudge ? "on" : "off"})`
  );
  const limit = pLimit(concurrency);
  const startMs = Date.now();
  let done = 0;
  const runs: RawRun[] = [];

  await Promise.all(
    cells.map((cell) =>
      limit(async () => {
        const run = await runOne(cell);
        const rule = applyRules(run);
        let intentNotVerbatim: 0 | 0.5 | 1 = 0;
        let noFalsePositive: 0 | 1 = 1;
        if (doJudge && rule.called === 1) {
          const verdict = await judgeRun(run);
          intentNotVerbatim = verdict.intent;
          noFalsePositive = verdict.fp;
          run.judge = { intent: verdict.intent, fp: verdict.fp };
        }
        run.score = computeTotal({
          called: rule.called,
          correctType: rule.correctType,
          intentNotVerbatim,
          noFalsePositive,
          noOverSave: rule.noOverSave,
        });
        runs.push(run);
        appendFileSync(jsonlPath, `${JSON.stringify(run)}\n`, "utf8");
        done++;
        if (done % 25 === 0 || done === cells.length) {
          const elapsedSec = Math.round((Date.now() - startMs) / 1000);
          console.log(`  [${done}/${cells.length}] ${elapsedSec}s elapsed`);
        }
      })
    )
  );

  console.log(`\nWrote raw runs → ${jsonlPath}`);

  if (emitReportAfter) {
    const { reportPath, winnersPath } = emitReport(runs, outDir, jsonlPath);
    console.log(`Report → ${reportPath}`);
    console.log(`Winners → ${winnersPath}`);
    const rollups = buildRollups(runs);
    const winners = pickWinners(rollups);
    console.log("");
    console.log(summarizeForConsole(winners));
  }

  return { jsonlPath, runs };
}

function findLatestJsonl(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("runs-") && f.endsWith(".jsonl"))
    .map((f) => ({ name: f, mtime: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? resolve(dir, files[0].name) : undefined;
}

const program = new Command();
program.name("membank-eval").description("MEMORY_GUIDANCE prompt sweep on Haiku");

program
  .command("smoke")
  .description("Smoke test: 2 prompts × 2 scenarios × 1 harness × 1 pin × 1 rep, no judge")
  .option("--out-dir <path>", "results directory", RESULTS_DIR)
  .action(async (opts: { outDir: string }) => {
    const outDir = resolve(opts.outDir);
    await runGrid({
      prompts: ["control", "V1"],
      harnesses: ["claude-code"],
      pinStates: ["empty"],
      scenarioIds: ["D1", "F1"],
      reps: 1,
      concurrency: 4,
      outDir,
      doJudge: false,
      fileLabel: "smoke",
      emitReportAfter: false,
    });
    console.log(
      "\nSmoke pass complete. Inspect the JSONL above to confirm Haiku accepted the request shape."
    );
  });

program
  .command("sweep")
  .description("Full sweep across prompts × scenarios × harnesses × pin-states × reps")
  .option("--prompts <list>", "comma-separated prompt ids", PROMPT_IDS.join(","))
  .option("--harnesses <list>", "comma-separated harness ids", HARNESSES.join(","))
  .option("--pin-states <list>", "comma-separated pin states", PIN_STATES.join(","))
  .option("--scenarios <list>", "comma-separated scenario ids (default all)")
  .option("--reps <n>", "reps per cell", "5")
  .option("--concurrency <n>", "parallel requests", "8")
  .option("--out-dir <path>", "results directory", RESULTS_DIR)
  .option("--no-judge", "skip Sonnet judge call (rule-only scoring)")
  .action(async (opts: SweepOptions) => {
    const prompts = parseList(opts.prompts, PROMPT_IDS, "prompt");
    const harnesses = parseList(opts.harnesses, HARNESSES, "harness");
    const pinStates = parseList(opts.pinStates, PIN_STATES, "pin-state");
    const scenarioIds = opts.scenarios
      ? opts.scenarios.split(",").map((s) => s.trim())
      : SCENARIOS.map((s) => s.id);
    for (const id of scenarioIds) {
      if (!SCENARIOS.find((s) => s.id === id)) {
        throw new Error(`Unknown scenario id: ${id}`);
      }
    }
    const reps = Number(opts.reps);
    const concurrency = Number(opts.concurrency);
    const outDir = resolve(opts.outDir ?? RESULTS_DIR);

    await runGrid({
      prompts,
      harnesses,
      pinStates,
      scenarioIds,
      reps,
      concurrency,
      outDir,
      doJudge: opts.noJudge !== true,
      fileLabel: "sweep",
      emitReportAfter: true,
    });
  });

program
  .command("report")
  .description("Re-emit markdown + winners.json from an existing JSONL")
  .option("--file <path>", "input JSONL (default: latest in results/)")
  .option("--out-dir <path>", "results directory", RESULTS_DIR)
  .action((opts: { file?: string; outDir: string }) => {
    const outDir = resolve(opts.outDir);
    const file = opts.file ? resolve(opts.file) : findLatestJsonl(outDir);
    if (!file || !existsSync(file)) {
      throw new Error("No JSONL file found. Run a sweep first or pass --file.");
    }
    const runs = loadRuns(file);
    const { reportPath, winnersPath } = emitReport(runs, outDir, file);
    console.log(`Report → ${reportPath}`);
    console.log(`Winners → ${winnersPath}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
