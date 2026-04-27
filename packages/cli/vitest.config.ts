import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@membank/core": fileURLToPath(new URL("../core/dist/index.mjs", import.meta.url)),
    },
  },
  test: {},
});
