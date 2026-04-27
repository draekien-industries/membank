import type { Memory } from "@membank/core";

export interface QueryResult extends Memory {
  score: number;
}

export class Formatter {
  readonly #isJson: boolean;

  constructor(isJson: boolean) {
    this.#isJson = isJson;
  }

  static create(): Formatter {
    // Auto-detect TTY: if stdout is not a terminal, implicitly use JSON mode
    const isJson = !process.stdout.isTTY;
    return new Formatter(isJson);
  }

  withJson(isJson: boolean): Formatter {
    return new Formatter(isJson);
  }

  get isJson(): boolean {
    return this.#isJson;
  }

  outputQueryResults(results: QueryResult[]): void {
    if (this.#isJson) {
      process.stdout.write(`${JSON.stringify(results)}\n`);
      return;
    }

    if (results.length === 0) {
      process.stdout.write("No memories found.\n");
      return;
    }

    for (const result of results) {
      const tags = result.tags.length > 0 ? result.tags.join(", ") : "(none)";
      process.stdout.write(`\n[${result.type}] ${result.id}\n`);
      process.stdout.write(`  Content : ${result.content}\n`);
      process.stdout.write(`  Tags    : ${tags}\n`);
      process.stdout.write(`  Scope   : ${result.scope}\n`);
      process.stdout.write(`  Score   : ${result.score.toFixed(4)}\n`);
    }
    process.stdout.write("\n");
  }

  error(msg: string): void {
    if (this.#isJson) {
      process.stderr.write(`${JSON.stringify({ error: msg })}\n`);
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
  }
}
