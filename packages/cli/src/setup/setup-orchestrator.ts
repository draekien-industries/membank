import { createInterface } from "node:readline";
import type { HarnessConfigWriter } from "./harness-config-writer.js";
import type { DetectedHarness } from "./harness-detector.js";
import { detectHarnesses } from "./harness-detector.js";

export type Prompter = (question: string) => Promise<boolean>;

export interface ModelDownloaderLike {
  download(): Promise<{ skipped: boolean }>;
}

export interface SetupResult {
  harness: string;
  status: "written" | "already-configured" | "skipped" | "error";
  error?: string;
}

export interface OrchestratorDeps {
  detector?: () => DetectedHarness[];
  writer: HarnessConfigWriter;
  prompter?: Prompter;
  modelDownloader?: ModelDownloaderLike;
  out?: (msg: string) => void;
}

function defaultPrompter(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

export class SetupOrchestrator {
  readonly #detector: () => DetectedHarness[];
  readonly #writer: HarnessConfigWriter;
  readonly #prompter: Prompter;
  readonly #modelDownloader: ModelDownloaderLike | undefined;
  readonly #out: (msg: string) => void;

  constructor(deps: OrchestratorDeps) {
    this.#detector = deps.detector ?? (() => detectHarnesses());
    this.#writer = deps.writer;
    this.#prompter = deps.prompter ?? defaultPrompter;
    this.#modelDownloader = deps.modelDownloader;
    this.#out = deps.out ?? ((msg) => process.stdout.write(`${msg}\n`));
  }

  async run(opts: { yes?: boolean; dryRun?: boolean } = {}): Promise<SetupResult[]> {
    const { yes = false, dryRun = false } = opts;

    const detected = this.#detector();

    if (detected.length === 0) {
      this.#out("No supported harnesses detected.");
      this.#out("");
      this.#out("Supported harnesses: claude-code, vscode, codex, opencode");
      return [];
    }

    this.#out("Detected harnesses:");
    for (const h of detected) {
      this.#out(`  • ${h.name}  (${h.configPath})`);
    }
    this.#out("");

    if (dryRun) {
      this.#out("Planned changes (dry-run — no files written):");
      for (const h of detected) {
        this.#out(`  ⚠ ${h.name}: would write MCP config`);
      }
      this.#out("");
      this.#out("Model download step: see DRA-52");
      return detected.map((h) => ({ harness: h.name, status: "skipped" as const }));
    }

    if (!yes) {
      const proceed = await this.#prompter("Proceed with writing configs?");
      if (!proceed) {
        this.#out("Aborted.");
        return [];
      }
    }

    const results: SetupResult[] = [];

    for (const h of detected) {
      let writeResult: { status: "written" | "already-configured" } | undefined;

      try {
        writeResult = this.#writer.write(h.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.#out(`  ✗ ${h.name}: ${msg}`);
        results.push({ harness: h.name, status: "error", error: msg });
        continue;
      }

      if (writeResult.status === "already-configured") {
        let overwrite = yes;
        if (!yes) {
          overwrite = await this.#prompter(`  ${h.name} is already configured. Overwrite?`);
        }

        if (!overwrite) {
          this.#out(`  ⚠ ${h.name}: already configured (skipped)`);
          results.push({ harness: h.name, status: "already-configured" });
          continue;
        }

        try {
          this.#writer.write(h.name, { overwrite: true });
          this.#out(`  ✓ ${h.name}: written (overwritten)`);
          results.push({ harness: h.name, status: "written" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.#out(`  ✗ ${h.name}: ${msg}`);
          results.push({ harness: h.name, status: "error", error: msg });
        }
        continue;
      }

      this.#out(`  ✓ ${h.name}: written`);
      results.push({ harness: h.name, status: "written" });
    }

    this.#out("");

    // Model download placeholder — DRA-52 will wire up the real ModelDownloader here.
    if (this.#modelDownloader) {
      await this.#modelDownloader.download();
    } else {
      this.#out("Model download step: see DRA-52");
    }

    const written = results.filter((r) => r.status === "written").length;
    const skipped = results.filter((r) => r.status === "already-configured").length;
    const errors = results.filter((r) => r.status === "error").length;

    this.#out("");
    this.#out(
      `Setup complete: ${written} written, ${skipped} already configured, ${errors} errors`
    );

    return results;
  }
}
