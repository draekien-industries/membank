import { createInterface } from "node:readline";
import type { HarnessConfigWriter } from "./harness-config-writer.js";
import { SUPPORTED_HARNESSES } from "./harness-config-writer.js";
import type { DetectedHarness } from "./harness-detector.js";
import { detectHarnesses } from "./harness-detector.js";

export type Prompter = (question: string) => Promise<boolean>;

export interface DownloadProgressLike {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  estimatedSecondsRemaining: number;
}

export interface ModelDownloaderLike {
  download(): Promise<{ skipped: boolean }>;
  on?(event: "progress", listener: (p: DownloadProgressLike) => void): void;
}

export interface SetupResult {
  harness: string;
  status: "written" | "already-configured" | "skipped" | "error";
  error?: string;
}

export interface SetupJsonOutput {
  detectedHarnesses: string[];
  configuredHarnesses: string[];
  modelDownloaded: boolean;
}

export interface OrchestratorDeps {
  detector?: () => DetectedHarness[];
  writer: HarnessConfigWriter;
  prompter?: Prompter;
  modelDownloader?: ModelDownloaderLike;
  out?: (msg: string) => void;
  progressWrite?: (text: string) => void;
}

function renderProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${percentage.toFixed(0)}%`;
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
  readonly #progressWrite: (text: string) => void;

  constructor(deps: OrchestratorDeps) {
    this.#detector = deps.detector ?? (() => detectHarnesses());
    this.#writer = deps.writer;
    this.#prompter = deps.prompter ?? defaultPrompter;
    this.#modelDownloader = deps.modelDownloader;
    this.#out = deps.out ?? ((msg) => process.stdout.write(`${msg}\n`));
    this.#progressWrite = deps.progressWrite ?? ((text) => process.stdout.write(text));
  }

  async run(
    opts: { yes?: boolean; dryRun?: boolean; harness?: string; json?: boolean } = {}
  ): Promise<SetupResult[]> {
    const { yes = false, dryRun = false, harness, json = false } = opts;

    const out = json ? () => {} : this.#out;

    let detected: DetectedHarness[];
    if (harness !== undefined) {
      detected = [{ name: harness as DetectedHarness["name"], configPath: "" }];
    } else {
      detected = this.#detector();
    }

    if (detected.length === 0) {
      out("No supported harnesses detected.");
      out("");
      out(`Supported harnesses: ${SUPPORTED_HARNESSES.join(", ")}`);
      if (json) {
        this.#out(
          JSON.stringify({ detectedHarnesses: [], configuredHarnesses: [], modelDownloaded: false })
        );
      }
      return [];
    }

    if (!json) {
      out("Detected harnesses:");
      for (const h of detected) {
        out(`  • ${h.name}  (${h.configPath})`);
      }
      out("");
    }

    if (dryRun) {
      out("Planned changes (dry-run — no files written):");
      for (const h of detected) {
        out(`  ⚠ ${h.name}: would write MCP config`);
      }
      out("");
      out("  ⚠ Model download: skipped (dry-run)");
      return detected.map((h) => ({ harness: h.name, status: "skipped" as const }));
    }

    if (!yes) {
      const proceed = await this.#prompter("Proceed with writing configs?");
      if (!proceed) {
        out("Aborted.");
        return [];
      }
    }

    const results: SetupResult[] = [];

    for (const h of detected) {
      let writeResult: { status: "written" | "already-configured" } | undefined;

      try {
        writeResult = await this.#writer.write(h.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        out(`  ✗ ${h.name}: ${msg}`);
        results.push({ harness: h.name, status: "error", error: msg });
        continue;
      }

      if (writeResult.status === "already-configured") {
        let overwrite = yes;
        if (!yes) {
          overwrite = await this.#prompter(`  ${h.name} is already configured. Overwrite?`);
        }

        if (!overwrite) {
          out(`  ⚠ ${h.name}: already configured (skipped)`);
          results.push({ harness: h.name, status: "already-configured" });
          continue;
        }

        try {
          await this.#writer.write(h.name, { overwrite: true });
          out(`  ✓ ${h.name}: written (overwritten)`);
          results.push({ harness: h.name, status: "written" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          out(`  ✗ ${h.name}: ${msg}`);
          results.push({ harness: h.name, status: "error", error: msg });
        }
        continue;
      }

      out(`  ✓ ${h.name}: written`);
      results.push({ harness: h.name, status: "written" });
    }

    out("");

    let modelDownloaded = false;
    if (this.#modelDownloader) {
      const dlResult = await this.#runModelDownload(this.#modelDownloader, out);
      modelDownloaded = !dlResult.skipped;
    } else {
      out("Model download step: see DRA-52");
    }

    const written = results.filter((r) => r.status === "written").length;
    const skipped = results.filter((r) => r.status === "already-configured").length;
    const errors = results.filter((r) => r.status === "error").length;

    if (json) {
      const detectedHarnesses = detected.map((h) => h.name);
      const configuredHarnesses = results
        .filter((r) => r.status === "written")
        .map((r) => r.harness);
      const output: SetupJsonOutput = { detectedHarnesses, configuredHarnesses, modelDownloaded };
      this.#out(JSON.stringify(output));
    } else {
      out("");
      out(`Setup complete: ${written} written, ${skipped} already configured, ${errors} errors`);
    }

    return results;
  }

  async #runModelDownload(
    downloader: ModelDownloaderLike,
    out: (msg: string) => void
  ): Promise<{ skipped: boolean }> {
    out("Downloading embedding model (bge-small-en-v1.5, ~33 MB)...");

    downloader.on?.("progress", (p) => {
      const bar = renderProgressBar(p.percentage, 30);
      const mb = (p.downloadedBytes / 1_048_576).toFixed(1);
      const total = (p.totalBytes / 1_048_576).toFixed(1);
      const eta =
        p.estimatedSecondsRemaining > 0 ? ` ETA ${Math.ceil(p.estimatedSecondsRemaining)}s` : "";
      this.#progressWrite(`\r  ${bar} ${mb}/${total} MB${eta}`);
    });

    try {
      const result = await downloader.download();
      if (result.skipped) {
        out("  ✓ Model already cached, skipping download.");
      } else {
        this.#progressWrite("\r");
        out("  ✓ Model downloaded successfully.");
      }
      return result;
    } catch (err) {
      this.#progressWrite("\r");
      const msg = err instanceof Error ? err.message : String(err);
      out(`  ✗ Model download failed: ${msg}`);
      throw err;
    }
  }
}
