import { EventEmitter } from "node:events";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/bge-small-en-v1.5";

export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  estimatedSecondsRemaining: number;
}

export interface DownloadResult {
  skipped: boolean;
}

export class ModelDownloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelDownloadError";
  }
}

function defaultModelPath(): string {
  return join(homedir(), ".membank", "models");
}

function isCached(modelPath: string): boolean {
  if (!existsSync(modelPath)) return false;
  try {
    return readdirSync(modelPath).length > 0;
  } catch {
    return false;
  }
}

export class ModelDownloader extends EventEmitter {
  private readonly modelPath: string;

  constructor(modelPath?: string) {
    super();
    this.modelPath = modelPath ?? defaultModelPath();
  }

  async download(): Promise<DownloadResult> {
    if (isCached(this.modelPath)) {
      return { skipped: true };
    }

    const startTime = Date.now();
    let lastDownloadedBytes = 0;
    let lastTimestamp = startTime;

    try {
      await pipeline("feature-extraction", MODEL_NAME, {
        cache_dir: this.modelPath,
        progress_callback: (event: { status: string; loaded?: number; total?: number }) => {
          if (event.status !== "progress" || event.total == null || event.loaded == null) return;

          const totalBytes = event.total;
          const downloadedBytes = event.loaded;
          const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

          const now = Date.now();
          const elapsedSinceLastMs = now - lastTimestamp;
          const bytesSinceLast = downloadedBytes - lastDownloadedBytes;

          let estimatedSecondsRemaining = 0;
          if (elapsedSinceLastMs > 0 && bytesSinceLast > 0) {
            const bytesPerMs = bytesSinceLast / elapsedSinceLastMs;
            const remaining = totalBytes - downloadedBytes;
            estimatedSecondsRemaining = remaining / bytesPerMs / 1000;
          }

          lastDownloadedBytes = downloadedBytes;
          lastTimestamp = now;

          const progress: DownloadProgress = {
            totalBytes,
            downloadedBytes,
            percentage,
            estimatedSecondsRemaining,
          };
          this.emit("progress", progress);
        },
      });
    } catch (err) {
      throw new ModelDownloadError("Failed to download model", { cause: err });
    }

    return { skipped: false };
  }
}
