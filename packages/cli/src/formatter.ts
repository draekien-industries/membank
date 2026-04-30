import type { Memory, MemoryType } from "@membank/core";
import chalk from "chalk";
import Table from "cli-table3";

export interface QueryResult extends Memory {
  score: number;
}

export interface StatsData {
  byType: Record<MemoryType, number>;
  total: number;
  needsReview: number;
}

const TYPE_COLORS: Record<MemoryType, (s: string) => string> = {
  correction: chalk.yellow,
  preference: chalk.cyan,
  decision: chalk.blue,
  learning: chalk.green,
  fact: chalk.dim,
};

function colorType(type: MemoryType): string {
  return TYPE_COLORS[type](type);
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export class Formatter {
  readonly #isJson: boolean;

  constructor(isJson: boolean) {
    this.#isJson = isJson;
  }

  static create(forceJson = false): Formatter {
    return new Formatter(forceJson || !process.stdout.isTTY);
  }

  get isJson(): boolean {
    return this.#isJson;
  }

  outputMemory(memory: Memory): void {
    if (this.#isJson) {
      process.stdout.write(`${JSON.stringify(memory)}\n`);
      return;
    }
    const tags = memory.tags.length > 0 ? memory.tags.join(", ") : "(none)";
    process.stdout.write("\n");
    process.stdout.write(`  ${colorType(memory.type)}  ${chalk.dim(memory.id)}\n`);
    process.stdout.write(`  ${memory.content}\n`);
    process.stdout.write(
      `  ${chalk.dim("Tags:")} ${tags}  ${chalk.dim("Scope:")} ${memory.scope}\n`
    );
    process.stdout.write(`\n  ${chalk.dim(`Hint: pin with  membank pin ${memory.id}`)}\n\n`);
  }

  outputMemories(memories: Memory[]): void {
    if (this.#isJson) {
      process.stdout.write(`${JSON.stringify(memories)}\n`);
      return;
    }

    if (memories.length === 0) {
      process.stdout.write(`${chalk.dim("No memories found.")}\n`);
      return;
    }

    const table = new Table({
      head: ["Type", "ID", "Content", "Pinned"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    });

    for (const m of memories) {
      const tags = m.tags.length > 0 ? m.tags.join(", ") : "(none)";
      const meta = `${truncate(m.content, 45)}\n${chalk.dim(`${tags} · ${m.scope}`)}`;
      table.push([colorType(m.type), chalk.dim(m.id), meta, m.pinned ? "📌" : ""]);
    }

    process.stdout.write(`\n${table.toString()}\n\n`);
  }

  outputStats(stats: StatsData): void {
    if (this.#isJson) {
      process.stdout.write(`${JSON.stringify(stats)}\n`);
      return;
    }

    const types: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];
    process.stdout.write("\n");
    for (const type of types) {
      process.stdout.write(`  ${TYPE_COLORS[type](type.padEnd(14))}  ${stats.byType[type]}\n`);
    }
    process.stdout.write(`\n  ${chalk.dim("─".repeat(24))}\n`);
    process.stdout.write(`  ${"total".padEnd(14)}  ${stats.total}\n`);
    if (stats.needsReview > 0) {
      process.stdout.write(
        `  ${chalk.yellow("⚠")} ${"needs_review".padEnd(12)}  ${stats.needsReview}\n\n`
      );
    } else {
      process.stdout.write(`  ${"  needs_review".padEnd(14)}  ${stats.needsReview}\n\n`);
    }
  }

  outputQueryResults(results: QueryResult[]): void {
    if (this.#isJson) {
      process.stdout.write(`${JSON.stringify(results)}\n`);
      return;
    }

    if (results.length === 0) {
      process.stdout.write(`${chalk.dim("No memories found.")}\n`);
      return;
    }

    const table = new Table({
      head: ["Type", "ID", "Content", "Score"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    });

    for (const r of results) {
      const scoreStr = r.score.toFixed(4);
      const score =
        r.score >= 0.85 ? chalk.bold(scoreStr) : r.score < 0.75 ? chalk.dim(scoreStr) : scoreStr;
      const tags = r.tags.length > 0 ? r.tags.join(", ") : "(none)";
      const meta = `${truncate(r.content, 45)}\n${chalk.dim(`${tags} · ${r.scope}`)}`;
      table.push([colorType(r.type), chalk.dim(r.id), meta, score]);
    }

    process.stdout.write(`\n${table.toString()}\n\n`);
  }

  error(msg: string): void {
    if (this.#isJson) {
      process.stderr.write(`${JSON.stringify({ error: msg })}\n`);
    } else {
      process.stderr.write(`${chalk.red("Error:")} ${msg}\n`);
    }
  }
}
