import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreSource = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));
const coreTestSupport = fileURLToPath(
  new URL("../core/src/test-support/index.ts", import.meta.url)
);

export default defineConfig({
  resolve: {
    // Exact-match entries: a string alias is applied as a prefix, which rewrites
    // subpath imports like `@membank/core/test-support` into a path under index.ts.
    alias: [
      { find: /^@membank\/core$/, replacement: coreSource },
      { find: /^@membank\/core\/test-support$/, replacement: coreTestSupport },
    ],
  },
  test: {
    exclude: ["**/node_modules/**"],
    testTimeout: 30000,
  },
});
