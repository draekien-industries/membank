import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  // Keep native modules and workspace packages external — installed via npm
  external: [
    "@membank/core",
    "@membank/mcp",
    "better-sqlite3",
    "sqlite-vec",
    "@huggingface/transformers",
  ],
  define: {
    "import.meta.url": "import.meta.url",
  },
});
