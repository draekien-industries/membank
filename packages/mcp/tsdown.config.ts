import { defineConfig } from "tsdown";

const sharedDeps = {
  neverBundle: ["@membank/core", "@modelcontextprotocol/sdk", "zod", "commander"],
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    minify: true,
    sourcemap: false,
    deps: sharedDeps,
  },
  {
    entry: ["src/bin.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    minify: true,
    sourcemap: false,
    deps: sharedDeps,
  },
]);
