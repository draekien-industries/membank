import { homedir } from "node:os";
import { join } from "node:path";
import { pipeline } from "@huggingface/transformers";
import type { Embedder } from "../../memory/ports.js";

export type ProgressCallback = (progress: { status: string; progress?: number }) => void;

export class EmbeddingService implements Embedder {
  private readonly modelCachePath: string;
  private readonly onProgress: ProgressCallback | undefined;
  private pipelineInstance: Awaited<ReturnType<typeof pipeline>> | null = null;

  constructor(modelCachePath?: string, onProgress?: ProgressCallback) {
    this.modelCachePath = modelCachePath ?? join(homedir(), ".membank", "models");
    this.onProgress = onProgress;
  }

  private async getPipeline(): Promise<Awaited<ReturnType<typeof pipeline>>> {
    if (this.pipelineInstance === null) {
      this.pipelineInstance = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
        cache_dir: this.modelCachePath,
        ...(this.onProgress !== undefined && { progress_callback: this.onProgress }),
      });
    }
    return this.pipelineInstance;
  }

  async embed(text: string): Promise<Float32Array> {
    const pipe = await this.getPipeline();
    // Shape: [1, seq_len, 384]. Cast to bypass the non-unified pipeline union signature.
    const output = await (
      pipe as (input: string, opts: Record<string, unknown>) => Promise<unknown>
    )(text, { pooling: "mean", normalize: true });

    const tensor = output as { data: Float32Array | number[] };
    const flat = tensor.data;

    return flat instanceof Float32Array ? flat : new Float32Array(flat);
  }
}
