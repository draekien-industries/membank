import { describe, expect, it } from "vitest";
import { EmbeddingService } from "./service.js";

const runIntegration = process.env["MEMBANK_INTEGRATION"] === "true";

describe.skipIf(!runIntegration)("EmbeddingService — integration (real model)", () => {
  it("loads the model and returns Float32Array[384]", async () => {
    const service = new EmbeddingService();
    const result = await service.embed("integration test sentence");
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(384);
  }, 120_000); // allow up to 2 min for model download on first run
});
