import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mock @huggingface/transformers before importing the module under test ----

type ProgressCallback = (event: { status: string; loaded?: number; total?: number }) => void;

type PipelineOptions = {
  cache_dir?: string;
  progress_callback?: ProgressCallback;
};

const mockPipeline = vi.fn(
  async (_task: unknown, _model: unknown, _opts?: PipelineOptions): Promise<unknown> => ({})
);

vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipeline,
}));

const { ModelDownloader, ModelDownloadError } = await import("./model-downloader.js");

// ---- helpers ----------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "membank-test-"));
}

// ---- tests ------------------------------------------------------------------

describe("ModelDownloader", () => {
  let tempDir: string;
  let modelPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    modelPath = join(tempDir, "models");
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("skip-when-cached", () => {
    it("returns { skipped: true } when model directory exists and has files", async () => {
      mkdirSync(modelPath, { recursive: true });
      writeFileSync(join(modelPath, "config.json"), "{}");

      const downloader = new ModelDownloader(modelPath);
      const result = await downloader.download();

      expect(result).toEqual({ skipped: true });
      expect(mockPipeline).not.toHaveBeenCalled();
    });

    it("does not skip when model directory does not exist", async () => {
      const downloader = new ModelDownloader(modelPath);
      await downloader.download();

      expect(mockPipeline).toHaveBeenCalledOnce();
    });

    it("does not skip when model directory exists but is empty", async () => {
      mkdirSync(modelPath, { recursive: true });

      const downloader = new ModelDownloader(modelPath);
      await downloader.download();

      expect(mockPipeline).toHaveBeenCalledOnce();
    });

    it("returns { skipped: false } when download completes", async () => {
      const downloader = new ModelDownloader(modelPath);
      const result = await downloader.download();

      expect(result).toEqual({ skipped: false });
    });
  });

  describe("progress events", () => {
    it("emits progress events in order with correct fields", async () => {
      mockPipeline.mockImplementationOnce(
        async (_task: unknown, _model: unknown, opts?: PipelineOptions) => {
          opts?.progress_callback?.({ status: "progress", loaded: 100, total: 1000 });
          opts?.progress_callback?.({ status: "progress", loaded: 500, total: 1000 });
          opts?.progress_callback?.({ status: "progress", loaded: 1000, total: 1000 });
          return {};
        }
      );

      const downloader = new ModelDownloader(modelPath);
      const events: Array<{
        totalBytes: number;
        downloadedBytes: number;
        percentage: number;
        estimatedSecondsRemaining: number;
      }> = [];
      downloader.on("progress", (ev) => events.push(ev));

      await downloader.download();

      expect(events).toHaveLength(3);

      expect(events[0]?.totalBytes).toBe(1000);
      expect(events[0]?.downloadedBytes).toBe(100);
      expect(events[0]?.percentage).toBeCloseTo(10);

      expect(events[1]?.totalBytes).toBe(1000);
      expect(events[1]?.downloadedBytes).toBe(500);
      expect(events[1]?.percentage).toBeCloseTo(50);

      expect(events[2]?.totalBytes).toBe(1000);
      expect(events[2]?.downloadedBytes).toBe(1000);
      expect(events[2]?.percentage).toBeCloseTo(100);
    });

    it("estimatedSecondsRemaining is a non-negative number", async () => {
      mockPipeline.mockImplementationOnce(
        async (_task: unknown, _model: unknown, opts?: PipelineOptions) => {
          opts?.progress_callback?.({ status: "progress", loaded: 200, total: 1000 });
          return {};
        }
      );

      const downloader = new ModelDownloader(modelPath);
      const events: Array<{ estimatedSecondsRemaining: number }> = [];
      downloader.on("progress", (ev) => events.push(ev));

      await downloader.download();

      expect(events[0]?.estimatedSecondsRemaining).toBeGreaterThanOrEqual(0);
    });

    it("ignores non-progress events from the pipeline callback", async () => {
      mockPipeline.mockImplementationOnce(
        async (_task: unknown, _model: unknown, opts?: PipelineOptions) => {
          opts?.progress_callback?.({ status: "initiate" });
          opts?.progress_callback?.({ status: "done" });
          opts?.progress_callback?.({ status: "progress", loaded: 50, total: 100 });
          return {};
        }
      );

      const downloader = new ModelDownloader(modelPath);
      const events: unknown[] = [];
      downloader.on("progress", (ev) => events.push(ev));

      await downloader.download();

      expect(events).toHaveLength(1);
    });

    it("emits no progress events when pipeline fires none", async () => {
      const downloader = new ModelDownloader(modelPath);
      const events: unknown[] = [];
      downloader.on("progress", (ev) => events.push(ev));

      await downloader.download();

      expect(events).toHaveLength(0);
    });
  });

  describe("failure propagation", () => {
    it("throws ModelDownloadError when pipeline rejects", async () => {
      const originalError = new Error("network failure");
      mockPipeline.mockRejectedValueOnce(originalError);

      const downloader = new ModelDownloader(modelPath);

      await expect(downloader.download()).rejects.toThrow(ModelDownloadError);
    });

    it("wraps the original error as the cause", async () => {
      const originalError = new Error("timeout");
      mockPipeline.mockRejectedValueOnce(originalError);

      const downloader = new ModelDownloader(modelPath);

      try {
        await downloader.download();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ModelDownloadError);
        expect((err as Error).cause).toBe(originalError);
      }
    });

    it("ModelDownloadError has the correct name", async () => {
      mockPipeline.mockRejectedValueOnce(new Error("fail"));

      const downloader = new ModelDownloader(modelPath);

      try {
        await downloader.download();
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).name).toBe("ModelDownloadError");
      }
    });

    it("does not emit progress events after a failure", async () => {
      const originalError = new Error("abort");
      mockPipeline.mockRejectedValueOnce(originalError);

      const downloader = new ModelDownloader(modelPath);
      const events: unknown[] = [];
      downloader.on("progress", (ev) => events.push(ev));

      await expect(downloader.download()).rejects.toThrow(ModelDownloadError);
      expect(events).toHaveLength(0);
    });
  });

  describe("injectable model path", () => {
    it("passes the injected path as cache_dir to the pipeline", async () => {
      const customPath = join(tempDir, "custom-models");
      const downloader = new ModelDownloader(customPath);
      await downloader.download();

      expect(mockPipeline).toHaveBeenCalledWith(
        "feature-extraction",
        "Xenova/bge-small-en-v1.5",
        expect.objectContaining({ cache_dir: customPath })
      );
    });

    it("two downloaders with different paths are independent", async () => {
      const pathA = join(tempDir, "models-a");
      const pathB = join(tempDir, "models-b");

      mkdirSync(pathA, { recursive: true });
      writeFileSync(join(pathA, "config.json"), "{}");

      const a = new ModelDownloader(pathA);
      const b = new ModelDownloader(pathB);

      const resultA = await a.download();
      const resultB = await b.download();

      expect(resultA.skipped).toBe(true);
      expect(resultB.skipped).toBe(false);
    });
  });
});
