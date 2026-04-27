import { beforeEach, describe, expect, it, vi } from "vitest";

// Build a deterministic fake tensor for any input text.
function makeFakeTensor(text: string) {
  const DIM = 384;
  const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const data = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    data[i] = Math.sin(seed + i);
  }
  return { data };
}

const mockPipelineFn = vi.fn(async (text: string) => makeFakeTensor(text));

type PipelineOpts = {
  cache_dir?: string;
  progress_callback?: (ev: { status: string; progress?: number }) => void;
};
const mockPipelineFactory = vi.fn(
  async (_task?: unknown, _model?: unknown, _opts?: PipelineOpts) => mockPipelineFn
);

vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipelineFactory,
}));

// Import after mocking so the module picks up the mock.
const { EmbeddingService } = await import("./service.js");

describe("EmbeddingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Float32Array of exactly 384 dimensions", async () => {
    const service = new EmbeddingService();
    const result = await service.embed("hello world");
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(384);
  });

  it("produces the same output for the same input (determinism)", async () => {
    const service = new EmbeddingService();
    const first = await service.embed("deterministic input");
    const second = await service.embed("deterministic input");
    expect(first).toEqual(second);
  });

  it("initialises the pipeline only once across multiple embed() calls", async () => {
    const service = new EmbeddingService();
    await service.embed("call one");
    await service.embed("call two");
    await service.embed("call three");
    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
  });

  it("forwards progress events to the onProgress callback", async () => {
    const onProgress = vi.fn();
    const service = new EmbeddingService(undefined, onProgress);

    // Simulate a progress_callback invocation from the pipeline factory.
    mockPipelineFactory.mockImplementationOnce(
      async (_task?: unknown, _model?: unknown, opts?: PipelineOpts) => {
        // Invoke the callback the way @huggingface/transformers would.
        if (opts?.progress_callback) {
          opts.progress_callback({ status: "downloading", progress: 50 });
        }
        return mockPipelineFn;
      }
    );

    await service.embed("test");
    expect(onProgress).toHaveBeenCalledWith({ status: "downloading", progress: 50 });
  });
});
