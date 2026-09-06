import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "test-support": "src/test-support/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: false,
  deps: {
    neverBundle: [
      "better-sqlite3",
      "sqlite-vec",
      "@huggingface/transformers",
      "@anthropic-ai/claude-agent-sdk",
      "zod",
    ],
  },
});
