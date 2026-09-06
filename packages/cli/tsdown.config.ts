import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  deps: {
    // Workspace packages and native modules are installed via npm — not bundled
    neverBundle: ["@membank/core", "@membank/mcp", "sqlite-vec", "@huggingface/transformers"],
  },
  define: {
    "import.meta.url": "import.meta.url",
  },
});
