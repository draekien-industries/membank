import { describe, expect, it, vi } from "vitest";
import type { HarnessConfigWriter } from "./harness-config-writer.js";
import type { DetectedHarness } from "./harness-detector.js";
import type { DownloadProgressLike, ModelDownloaderLike } from "./setup-orchestrator.js";
import { SetupOrchestrator } from "./setup-orchestrator.js";

function makeWriter(): HarnessConfigWriter {
  return {
    write: vi.fn(() => ({ status: "written" as const })),
  } as unknown as HarnessConfigWriter;
}

function makeHarness(name: string): DetectedHarness {
  return { name: name as DetectedHarness["name"], configPath: `/fake/${name}/config.json` };
}

interface MockDownloader extends ModelDownloaderLike {
  download: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _fireProgress: (p: DownloadProgressLike) => void;
}

function makeMockDownloader(downloadResult: { skipped: boolean } | (() => never)): MockDownloader {
  let progressListener: ((p: DownloadProgressLike) => void) | undefined;

  const mock: MockDownloader = {
    download: vi.fn(async () => {
      if (typeof downloadResult === "function") {
        return downloadResult();
      }
      return downloadResult;
    }),
    on: vi.fn((event: string, listener: (p: DownloadProgressLike) => void) => {
      if (event === "progress") {
        progressListener = listener;
      }
    }),
    _fireProgress: (p: DownloadProgressLike) => {
      progressListener?.(p);
    },
  };

  return mock;
}

function makeOrchestrator(opts: {
  detected?: DetectedHarness[];
  modelDownloader?: ModelDownloaderLike;
  progressWrite?: (text: string) => void;
}): { orchestrator: SetupOrchestrator; lines: string[] } {
  const lines: string[] = [];
  const detected = opts.detected;
  const orchestrator = new SetupOrchestrator({
    detector: detected !== undefined ? () => detected : () => [makeHarness("claude-code")],
    writer: makeWriter(),
    prompter: vi.fn().mockResolvedValue(true),
    modelDownloader: opts.modelDownloader,
    out: (msg) => lines.push(msg),
    progressWrite: opts.progressWrite ?? vi.fn(),
  });
  return { orchestrator, lines };
}

// --- AC: model download runs as the final step ---

describe("model download — final step", () => {
  it("calls download() after writing harness configs", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const { orchestrator } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ yes: true });

    expect(downloader.download).toHaveBeenCalledOnce();
  });
});

// --- AC: model size and estimated time printed before download ---

describe("model download — preamble output", () => {
  it("prints model size info before download begins", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const { orchestrator, lines } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ yes: true });

    const preamble = lines.find((l) => l.includes("bge-small-en-v1.5") || l.includes("33 MB"));
    expect(preamble).toBeDefined();
  });
});

// --- AC: progress bar renders during download ---

describe("model download — progress bar", () => {
  it("writes progress bar to progressWrite during download", async () => {
    const progressWrites: string[] = [];
    const downloader = makeMockDownloader({ skipped: false });

    const { orchestrator } = makeOrchestrator({
      modelDownloader: downloader,
      progressWrite: (text) => progressWrites.push(text),
    });

    // Trigger progress events during download by overriding download to fire progress
    downloader.download.mockImplementation(async () => {
      downloader._fireProgress({
        totalBytes: 34_000_000,
        downloadedBytes: 17_000_000,
        percentage: 50,
        estimatedSecondsRemaining: 5,
      });
      return { skipped: false };
    });

    await orchestrator.run({ yes: true });

    const barWrite = progressWrites.find((t) => t.includes("\r") && t.includes("%"));
    expect(barWrite).toBeDefined();
    expect(barWrite).toContain("[");
    expect(barWrite).toContain("]");
  });

  it("progress bar writes start with \\r to update in-place", async () => {
    const progressWrites: string[] = [];
    const downloader = makeMockDownloader({ skipped: false });

    const { orchestrator } = makeOrchestrator({
      modelDownloader: downloader,
      progressWrite: (text) => progressWrites.push(text),
    });

    downloader.download.mockImplementation(async () => {
      downloader._fireProgress({
        totalBytes: 1000,
        downloadedBytes: 300,
        percentage: 30,
        estimatedSecondsRemaining: 2,
      });
      return { skipped: false };
    });

    await orchestrator.run({ yes: true });

    const barWrite = progressWrites.find((t) => t.includes("%"));
    expect(barWrite?.startsWith("\r")).toBe(true);
  });

  it("subscribes to progress events via on()", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const { orchestrator } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ yes: true });

    expect(downloader.on).toHaveBeenCalledWith("progress", expect.any(Function));
  });
});

// --- AC: model already cached — shows ✓ and skips ---

describe("model download — already cached", () => {
  it("prints ✓ and skip message when model is cached", async () => {
    const downloader = makeMockDownloader({ skipped: true });
    const { orchestrator, lines } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ yes: true });

    const skipLine = lines.find((l) => l.includes("✓") && l.includes("cached"));
    expect(skipLine).toBeDefined();
  });

  it("calls download() even when cached (downloader decides to skip)", async () => {
    const downloader = makeMockDownloader({ skipped: true });
    const { orchestrator } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ yes: true });

    expect(downloader.download).toHaveBeenCalledOnce();
  });
});

// --- AC: --dry-run skips the download step entirely ---

describe("model download — dry-run", () => {
  it("does not call download() in dry-run mode", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const { orchestrator } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ dryRun: true });

    expect(downloader.download).not.toHaveBeenCalled();
  });

  it("prints dry-run skip message for model download", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const { orchestrator, lines } = makeOrchestrator({ modelDownloader: downloader });

    await orchestrator.run({ dryRun: true });

    const dryRunLine = lines.find(
      (l) => l.toLowerCase().includes("dry-run") && l.toLowerCase().includes("model")
    );
    expect(dryRunLine).toBeDefined();
  });
});

// --- AC: --yes proceeds without prompting ---

describe("model download — --yes flag", () => {
  it("runs download without any confirmation prompt when --yes is set", async () => {
    const prompter = vi.fn().mockResolvedValue(true);
    const downloader = makeMockDownloader({ skipped: false });
    const lines: string[] = [];

    const orchestrator = new SetupOrchestrator({
      detector: () => [makeHarness("claude-code")],
      writer: makeWriter(),
      prompter,
      modelDownloader: downloader,
      out: (msg) => lines.push(msg),
      progressWrite: vi.fn(),
    });

    await orchestrator.run({ yes: true });

    expect(prompter).not.toHaveBeenCalled();
    expect(downloader.download).toHaveBeenCalledOnce();
  });
});

// --- AC: download failure reported as ✗ with error reason; throws (exit code non-zero) ---

describe("model download — failure", () => {
  it("prints ✗ with error message when download fails", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    downloader.download.mockRejectedValue(new Error("network timeout"));

    const { orchestrator, lines } = makeOrchestrator({ modelDownloader: downloader });

    await expect(orchestrator.run({ yes: true })).rejects.toThrow("network timeout");

    const errorLine = lines.find((l) => l.includes("✗") && l.includes("network timeout"));
    expect(errorLine).toBeDefined();
  });

  it("re-throws the download error so the caller can set non-zero exit code", async () => {
    const downloader = makeMockDownloader({ skipped: false });
    const originalError = new Error("disk full");
    downloader.download.mockRejectedValue(originalError);

    const { orchestrator } = makeOrchestrator({ modelDownloader: downloader });

    await expect(orchestrator.run({ yes: true })).rejects.toBe(originalError);
  });

  it("writes \\r before printing the error line to clear the progress bar", async () => {
    const progressWrites: string[] = [];
    const downloader = makeMockDownloader({ skipped: false });
    downloader.download.mockRejectedValue(new Error("fail"));

    const { orchestrator } = makeOrchestrator({
      modelDownloader: downloader,
      progressWrite: (text) => progressWrites.push(text),
    });

    await expect(orchestrator.run({ yes: true })).rejects.toThrow();

    expect(progressWrites.some((t) => t === "\r")).toBe(true);
  });
});

// --- AC: no model downloader injected — DRA-52 placeholder still shown ---

describe("no model downloader injected", () => {
  it("prints DRA-52 placeholder when no model downloader is provided", async () => {
    const { orchestrator, lines } = makeOrchestrator({ modelDownloader: undefined });

    await orchestrator.run({ yes: true });

    expect(lines.some((l) => l.includes("DRA-52"))).toBe(true);
  });
});
