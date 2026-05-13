import { defineConfig } from "tsdown";

const sharedDeps = {
  neverBundle: [
    "@membank/core",
    "hono",
    "@hono/node-server",
    "open",
    "better-sqlite3",
    "sqlite-vec",
    "@huggingface/transformers",
    "commander",
  ],
};

export default defineConfig([
  {
    entry: ["src/server/index.ts"],
    outDir: "dist",
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    deps: sharedDeps,
    define: {
      "import.meta.url": "import.meta.url",
    },
  },
  {
    entry: ["src/server/bin.ts"],
    outDir: "dist",
    format: ["esm"],
    dts: false,
    clean: false,
    deps: sharedDeps,
    define: {
      "import.meta.url": "import.meta.url",
    },
  },
]);
