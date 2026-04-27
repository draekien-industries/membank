import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreSource = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@membank/core": coreSource,
    },
  },
  test: {
    exclude: ["**/node_modules/**"],
    testTimeout: 30000,
  },
});
