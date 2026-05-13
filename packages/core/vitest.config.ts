import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...(process.env.CI ? ["**/*.integration.test.ts"] : []), "**/node_modules/**"],
  },
});
