import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  external: ["@anthropic-ai/sdk"],
  define: {
    "import.meta.url": "import.meta.url",
  },
});
