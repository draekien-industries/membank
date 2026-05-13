import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: false,
  deps: {
    neverBundle: ["@membank/core", "@modelcontextprotocol/sdk", "zod"],
  },
});
