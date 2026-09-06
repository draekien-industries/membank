import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreDist = fileURLToPath(new URL("../core/dist/index.mjs", import.meta.url));
const coreTestSupport = fileURLToPath(new URL("../core/dist/test-support.mjs", import.meta.url));

export default defineConfig({
  resolve: {
    // Exact-match entries: a string alias is applied as a prefix, which rewrites
    // subpath imports like `@membank/core/test-support` into a path under index.mjs.
    alias: [
      { find: /^@membank\/core$/, replacement: coreDist },
      { find: /^@membank\/core\/test-support$/, replacement: coreTestSupport },
    ],
  },
  test: {},
});
