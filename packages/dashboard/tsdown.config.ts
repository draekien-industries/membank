import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/server/index.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: false,
  clean: false,
  external: [
    "@membank/core",
    "hono",
    "@hono/node-server",
    "open",
    "better-sqlite3",
    "sqlite-vec",
    "@huggingface/transformers",
  ],
  define: {
    "import.meta.url": "import.meta.url",
  },
});
