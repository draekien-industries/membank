import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPrompt } from "./prompts/index.js";
import { SCENARIOS } from "./scenarios/index.js";
import {
  buildCellStats,
  buildRollups,
  type CellStats,
  type HarnessWinner,
  pickWinners,
  type RollupStats,
} from "./scoring/aggregate.js";
import type { RawRun } from "./types.js";
import { HARNESSES, PIN_STATES, PROMPT_IDS } from "./types.js";

export type { HarnessWinner } from "./scoring/aggregate.js";

export function loadRuns(jsonlPath: string): RawRun[] {
  const text = readFileSync(jsonlPath, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RawRun);
}

export function emitReport(
  runs: RawRun[],
  outDir: string,
  runFile: string
): { reportPath: string; winnersPath: string } {
  const cells = buildCellStats(runs);
  const rollups = buildRollups(runs);
  const winners = pickWinners(rollups);

  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = resolve(outDir, `report-${iso}.md`);
  const winnersPath = resolve(outDir, "winners.json");

  const md = renderMarkdown({ runs, cells, rollups, winners, runFile });
  writeFileSync(reportPath, md, "utf8");

  const winnersOut = winners.map((w) => ({
    harness: w.harness,
    winner: w.winner,
    score: w.winnerStats.mean,
    ciLow: w.winnerStats.ciLow,
    ciHigh: w.winnerStats.ciHigh,
    runnerUp: w.runnerUp,
    delta: w.delta,
    ciOverlapsRunnerUp: w.ciOverlapsRunnerUp,
    winnerText: getPrompt(w.winner).text,
  }));
  writeFileSync(winnersPath, JSON.stringify(winnersOut, null, 2), "utf8");

  return { reportPath, winnersPath };
}

interface RenderArgs {
  runs: RawRun[];
  cells: CellStats[];
  rollups: RollupStats[];
  winners: HarnessWinner[];
  runFile: string;
}

function renderMarkdown(args: RenderArgs): string {
  const { runs, cells, rollups, winners, runFile } = args;
  const total = runs.length;
  const errored = runs.filter((r) => r.error).length;
  const inputTok = runs.reduce((a, r) => a + r.inputTokens, 0);
  const cachedTok = runs.reduce((a, r) => a + r.cachedInputTokens, 0);
  const outputTok = runs.reduce((a, r) => a + r.outputTokens, 0);

  const lines: string[] = [];
  lines.push(`# MEMORY_GUIDANCE Eval Report`);
  lines.push(``);
  lines.push(`- Source: \`${runFile}\``);
  lines.push(`- Total runs: ${total} (errors: ${errored})`);
  lines.push(
    `- Tokens: ${inputTok.toLocaleString()} input (${cachedTok.toLocaleString()} cached), ${outputTok.toLocaleString()} output`
  );
  lines.push(``);
  lines.push(`## Per-harness winners`);
  lines.push(``);
  lines.push(`| Harness | Winner | Score | 95% CI | Runner-up | Δ | CI overlap |`);
  lines.push(`|---|---|---:|---|---|---:|:---:|`);
  for (const w of winners) {
    const ci = `[${w.winnerStats.ciLow.toFixed(3)}, ${w.winnerStats.ciHigh.toFixed(3)}]`;
    const ru = w.runnerUp ? `${w.runnerUp.promptId} (${w.runnerUp.mean.toFixed(3)})` : "—";
    const delta = w.delta !== undefined ? w.delta.toFixed(3) : "—";
    lines.push(
      `| ${w.harness} | **${w.winner}** | ${w.winnerStats.mean.toFixed(3)} | ${ci} | ${ru} | ${delta} | ${w.ciOverlapsRunnerUp ? "yes" : "no"} |`
    );
  }
  lines.push(``);

  lines.push(`## Slot-invariance check`);
  lines.push(``);
  const winnerSet = new Set(winners.map((w) => w.winner));
  if (winnerSet.size === 1) {
    const single = winners[0]?.winner;
    lines.push(
      `Single prompt **${single}** wins across all harnesses — slot-invariance hypothesis supported. Ship one MEMORY_GUIDANCE.`
    );
  } else {
    lines.push(
      `Different winners across harnesses (${[...winnerSet].join(", ")}) — slot affects triggering. Ship per-harness map.`
    );
  }
  lines.push(``);

  lines.push(`## Per-(prompt × harness) rollup`);
  lines.push(``);
  lines.push(`| Prompt | ${HARNESSES.join(" | ")} |`);
  lines.push(`|---|${HARNESSES.map(() => "---:").join("|")}|`);
  for (const promptId of PROMPT_IDS) {
    const cells = HARNESSES.map((h) => {
      const r = rollups.find((x) => x.promptId === promptId && x.harness === h);
      return r ? r.mean.toFixed(3) : "—";
    });
    lines.push(`| ${promptId} | ${cells.join(" | ")} |`);
  }
  lines.push(``);

  lines.push(`## Pin-state breakdown`);
  lines.push(``);
  lines.push(`| Prompt × Harness | empty | populated | Δ |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const promptId of PROMPT_IDS) {
    for (const h of HARNESSES) {
      const empty = cells.find(
        (c) => c.promptId === promptId && c.harness === h && c.pinState === "empty"
      );
      const populated = cells.find(
        (c) => c.promptId === promptId && c.harness === h && c.pinState === "populated"
      );
      if (!empty || !populated) continue;
      const delta = populated.mean - empty.mean;
      lines.push(
        `| ${promptId} × ${h} | ${empty.mean.toFixed(3)} | ${populated.mean.toFixed(3)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} |`
      );
    }
  }
  lines.push(``);

  lines.push(`## Per-scenario heatmap`);
  lines.push(``);
  lines.push(
    `Each cell = mean score across (4 harnesses × 2 pin states × N reps). Red < 0.5 means the prompt fails on that scenario.`
  );
  lines.push(``);
  lines.push(`| Scenario | Type | ${PROMPT_IDS.join(" | ")} |`);
  lines.push(`|---|---|${PROMPT_IDS.map(() => "---:").join("|")}|`);
  for (const s of SCENARIOS) {
    const row = [s.id, s.expectedType];
    for (const promptId of PROMPT_IDS) {
      const matching = runs.filter(
        (r) => r.promptId === promptId && r.scenarioId === s.id && r.score !== undefined
      );
      if (matching.length === 0) {
        row.push("—");
      } else {
        const m = matching.reduce((a, r) => a + (r.score ?? 0), 0) / matching.length;
        row.push(m < 0.5 ? `**${m.toFixed(2)}**` : m.toFixed(2));
      }
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push(``);

  lines.push(`## Recommended MEMORY_GUIDANCE per harness`);
  lines.push(``);
  for (const w of winners) {
    lines.push(`### ${w.harness} → ${w.winner}`);
    lines.push("");
    lines.push("```");
    lines.push(getPrompt(w.winner).text);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

export function summarizeForConsole(winners: HarnessWinner[]): string {
  const lines: string[] = [];
  lines.push("Per-harness winners:");
  for (const w of winners) {
    lines.push(
      `  ${w.harness}: ${w.winner} (${w.winnerStats.mean.toFixed(3)} ± ${((w.winnerStats.ciHigh - w.winnerStats.ciLow) / 2).toFixed(3)})`
    );
  }
  return lines.join("\n");
}

export { PIN_STATES };
