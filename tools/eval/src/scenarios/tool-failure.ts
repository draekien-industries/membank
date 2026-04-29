import type { Scenario } from "../types.js";
import { generateFiller } from "./filler.js";

const F1: Scenario = {
  id: "F1",
  class: "tool-failure",
  lengthBucket: "short",
  expectedType: "learning",
  expectedContent:
    "react-query has been renamed to @tanstack/react-query — the old npm name returns 404 on the registry.",
  messages: [
    { role: "user", content: "Add react-query to the project for the data fetching layer." },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Adding it now." },
        {
          type: "tool_use",
          id: "tu_f1_a",
          name: "Bash",
          input: { command: "pnpm add react-query", description: "Install react-query" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f1_a",
          content:
            "ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/react-query: Not Found - 404 Not Found",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "404 — the package name has likely changed. Checking the docs." },
        {
          type: "tool_use",
          id: "tu_f1_b",
          name: "WebFetch",
          input: {
            url: "https://tanstack.com/query/latest/docs/framework/react/installation",
            prompt: "What is the current npm package name for react-query?",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f1_b",
          content:
            "react-query was renamed to @tanstack/react-query starting with v4. Install with: pnpm add @tanstack/react-query",
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f1_c",
          name: "Bash",
          input: {
            command: "pnpm add @tanstack/react-query",
            description: "Install renamed package",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f1_c",
          content: "Progress: installed @tanstack/react-query 5.59.0 \nDone in 4.2s",
        },
      ],
    },
    { role: "user", content: "ok cool, carry on with the migration." },
  ],
};

const F2: Scenario = {
  id: "F2",
  class: "tool-failure",
  lengthBucket: "short",
  expectedType: "correction",
  expectedContent:
    "This repo uses pnpm — the lockfile is pnpm-lock.yaml. Do not use npm or yarn here.",
  messages: [
    { role: "user", content: "Install eslint-plugin-import as a dev dep." },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f2_a",
          name: "Bash",
          input: { command: "npm install -D eslint-plugin-import", description: "Install dev dep" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f2_a",
          content:
            "npm warn EBADENGINE Unsupported engine\nnpm error code EUSAGE\nnpm error This project is configured to use pnpm.\nnpm error preinstall script: 'npx only-allow pnpm' failed.",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "The repo enforces pnpm via only-allow. Switching." },
        {
          type: "tool_use",
          id: "tu_f2_b",
          name: "Bash",
          input: {
            command: "pnpm add -D eslint-plugin-import",
            description: "Install dev dep with pnpm",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f2_b",
          content: "Progress: installed eslint-plugin-import 2.31.0 \nDone in 3.1s",
        },
      ],
    },
    { role: "user", content: "Great, what's next on the lint config?" },
  ],
};

const F3: Scenario = {
  id: "F3",
  class: "tool-failure",
  lengthBucket: "medium",
  expectedType: "learning",
  expectedContent:
    "vite 5.x's build step crashes on Node 18 with a crypto.hash undefined error — Node 20.12+ is required.",
  messages: [
    { role: "user", content: "Run the production build to make sure it still works." },
    {
      role: "assistant",
      content: `Sure — kicking off the build. ${generateFiller(7001, 1500)}`,
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f3_a",
          name: "Bash",
          input: { command: "pnpm build", description: "Run production build" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f3_a",
          content:
            "vite v5.4.10 building for production...\nfailed during build at node:internal/process/promises:391\nTypeError: crypto.hash is not a function\n  at getHash (file:///.../node_modules/vite/dist/node/chunks/dep-2ee.js:51212:23)\n  at file:///.../node_modules/vite/dist/node/chunks/dep-2ee.js:51228:16\n  Node.js v18.20.4",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "crypto.hash was added in Node 20.12 — vite 5 needs that. CI is on 18. Checking the engines.",
        },
        {
          type: "tool_use",
          id: "tu_f3_b",
          name: "Read",
          input: { file_path: "package.json" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f3_b",
          content: '{\n  "name": "app",\n  "engines": { "node": ">=18.0.0" }\n}',
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Engines is too loose. Bumping to >=20.12. Pinning .nvmrc too.",
        },
        {
          type: "tool_use",
          id: "tu_f3_c",
          name: "Bash",
          input: {
            command: "echo '20.12.2' > .nvmrc && nvm use 20.12.2 && pnpm build",
            description: "Switch to Node 20 and rebuild",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f3_c",
          content:
            "Now using node v20.12.2 (npm v10.5.0)\nvite v5.4.10 building for production...\n✓ 142 modules transformed.\n✓ built in 8.32s",
        },
      ],
    },
    { role: "user", content: "OK build is green. What was wrong?" },
  ],
};

const F4: Scenario = {
  id: "F4",
  class: "tool-failure",
  lengthBucket: "medium",
  expectedType: "fact",
  expectedContent:
    "The application reads its database URL from the env var DATABASE_URL — not DB_URL, which is unused in this repo.",
  messages: [
    {
      role: "user",
      content: `Boot the dev server and connect to the local postgres. ${generateFiller(7002, 1500)}`,
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f4_a",
          name: "Bash",
          input: {
            command: "DB_URL=postgres://localhost:5432/dev pnpm dev",
            description: "Boot dev server with db url",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f4_a",
          content:
            "Error: connectDb() requires DATABASE_URL to be set.\n  at /src/db/connect.ts:8:11\n  at file:///src/server.ts:14:3",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Var name is DATABASE_URL, not DB_URL. Re-running." },
        {
          type: "tool_use",
          id: "tu_f4_b",
          name: "Bash",
          input: {
            command: "DATABASE_URL=postgres://localhost:5432/dev pnpm dev",
            description: "Boot dev server with correct env var",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f4_b",
          content:
            "[server] connected to postgres://localhost:5432/dev\n[server] listening on :3000",
        },
      ],
    },
    { role: "user", content: "Good, server is up. Now run the integration tests." },
  ],
};

const F5: Scenario = {
  id: "F5",
  class: "tool-failure",
  lengthBucket: "medium",
  expectedType: "learning",
  expectedContent:
    "Stripe charges.create is deprecated; current API uses paymentIntents.create with confirm: true.",
  messages: [
    {
      role: "user",
      content: `Implement a one-time charge using the Stripe SDK. ${generateFiller(7003, 1400)}`,
    },
    {
      role: "assistant",
      content:
        "Using stripe.charges.create — that's the canonical one-time charge call. Wiring it up now.",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f5_a",
          name: "Bash",
          input: { command: "pnpm test src/billing/charge.test.ts", description: "Run new test" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f5_a",
          content:
            "FAIL src/billing/charge.test.ts\n  StripeAPIError: Charges API has been deprecated. Use the PaymentIntents API.\n  See: https://stripe.com/docs/payments/payment-intents",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Charges is deprecated. Pulling the PaymentIntents docs." },
        {
          type: "tool_use",
          id: "tu_f5_b",
          name: "WebFetch",
          input: {
            url: "https://stripe.com/docs/payments/payment-intents",
            prompt: "Show the call signature for a one-off charge using PaymentIntents.",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f5_b",
          content:
            "Use stripe.paymentIntents.create({ amount, currency, payment_method, confirm: true }). The confirm flag captures funds in one call.",
        },
      ],
    },
    {
      role: "assistant",
      content: "Switching to paymentIntents.create with confirm:true and updating the test.",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f5_c",
          name: "Bash",
          input: { command: "pnpm test src/billing/charge.test.ts", description: "Re-run test" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f5_c",
          content: "PASS src/billing/charge.test.ts (1 test, 1 passed)",
        },
      ],
    },
    { role: "user", content: "Nice, that's green. Move on to the refunds path?" },
  ],
};

const F6: Scenario = {
  id: "F6",
  class: "tool-failure",
  lengthBucket: "long",
  expectedType: "learning",
  expectedContent:
    "Migrating from webpack 5 to vite required removing all process.env.* references in client code and switching to import.meta.env.VITE_*; webpack's DefinePlugin shimmed process.env, vite does not.",
  messages: [
    {
      role: "user",
      content:
        "Migrate the bundler from webpack to vite. Should be straightforward — the project is mostly ESM already. " +
        generateFiller(8001, 6000),
    },
    {
      role: "assistant",
      content:
        "Starting the migration. Pulling the existing webpack.config.js and the vite getting-started guide. " +
        generateFiller(8002, 4000),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f6_a",
          name: "Bash",
          input: { command: "pnpm vite build", description: "Initial vite build" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f6_a",
          content:
            "vite v5.4.10 building for production...\n[plugin:vite:rollup-error] process is not defined\n  at src/config.ts:14:21\n  at src/runtime/feature-flags.ts:8:9\n  at src/api/client.ts:22:35\n  ...18 more occurrences",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content:
        "process.env in client code — webpack's DefinePlugin had been silently inlining these. Vite expects import.meta.env.VITE_* with the VITE_ prefix exposed. " +
        generateFiller(8003, 5000),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f6_b",
          name: "Bash",
          input: {
            command: "grep -rn 'process.env' src --include='*.ts' --include='*.tsx' | head -30",
            description: "Enumerate process.env usages",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f6_b",
          content:
            "src/config.ts:14:    apiUrl: process.env.API_URL ?? '/api',\nsrc/config.ts:18:    flagHost: process.env.FLAGS_HOST,\nsrc/runtime/feature-flags.ts:8:    if (process.env.NODE_ENV === 'development') {\nsrc/api/client.ts:22:    headers: { 'X-App-Version': process.env.APP_VERSION },\n[...18 more lines...]",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "Rewriting all 21 references to use import.meta.env. Renaming the env vars to add the VITE_ prefix and updating the .env files. " +
        generateFiller(8004, 4500),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f6_c",
          name: "Bash",
          input: { command: "pnpm vite build", description: "Re-run after rewrite" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f6_c",
          content:
            "vite v5.4.10 building for production...\n✓ 247 modules transformed.\ndist/index.html              0.45 kB\ndist/assets/index-A8.js    142.33 kB\n✓ built in 6.84s",
        },
      ],
    },
    { role: "user", content: "build is green and bundle is 30% smaller. Run the smoke tests." },
  ],
};

const F7: Scenario = {
  id: "F7",
  class: "tool-failure",
  lengthBucket: "long",
  expectedType: "correction",
  expectedContent:
    "This repo's tsconfig requires moduleResolution: NodeNext (paired with module: NodeNext); plain `node` resolution breaks ESM imports that include the .js extension.",
  messages: [
    {
      role: "user",
      content: `Add a new package under packages/admin and wire it up. ${generateFiller(9001, 8000)}`,
    },
    {
      role: "assistant",
      content:
        "Setting up the package skeleton. Copying tsconfig from packages/cli but going to use moduleResolution: node since that's the standard. " +
        generateFiller(9002, 4000),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f7_a",
          name: "Bash",
          input: { command: "pnpm typecheck", description: "Typecheck the new package" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f7_a",
          content:
            "packages/admin/src/index.ts:3:33 - error TS2307: Cannot find module './client.js' or its corresponding type declarations.\npackages/admin/src/index.ts:4:24 - error TS2307: Cannot find module './routes/users.js' or its corresponding type declarations.\n[...41 more errors...]",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content:
        "These errors are because the imports include the .js extension but moduleResolution: node strips it during resolution. " +
        generateFiller(9003, 4000),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f7_b",
          name: "Read",
          input: { file_path: "tsconfig.json" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f7_b",
          content:
            '{\n  "compilerOptions": {\n    "module": "NodeNext",\n    "moduleResolution": "NodeNext",\n    "strict": true\n  }\n}',
        },
      ],
    },
    {
      role: "user",
      content:
        "Right — I should have flagged earlier. Every package in this repo uses moduleResolution: NodeNext and module: NodeNext. The .js extensions on imports are deliberate; they're required for NodeNext. Don't override that.",
    },
    {
      role: "assistant",
      content: "Got it — switching to NodeNext. Rerunning typecheck.",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f7_c",
          name: "Bash",
          input: { command: "pnpm typecheck", description: "Typecheck after fix" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f7_c",
          content: "Tasks: 4 successful, 4 total\nCached: 0 cached, 4 total\nTime: 8.24s",
        },
      ],
    },
    { role: "user", content: "Good. Now finish wiring the routes." },
  ],
};

const F8: Scenario = {
  id: "F8",
  class: "tool-failure",
  lengthBucket: "long",
  expectedType: "decision",
  expectedContent:
    "Migrating the test runner from jest to vitest because jest's experimental ESM mode is incompatible with this repo's NodeNext + sqlite-vec native module setup.",
  messages: [
    {
      role: "user",
      content:
        "CI is failing on the test job and has been for a few hours. Take a look. " +
        generateFiller(10001, 7000),
    },
    {
      role: "assistant",
      content: `Pulling the failing job logs. ${generateFiller(10002, 3500)}`,
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f8_a",
          name: "Bash",
          input: { command: "pnpm test", description: "Reproduce locally" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f8_a",
          content:
            "FAIL src/repo/store.test.ts\n  ReferenceError: require is not defined in ES module scope\n  at Object.<anonymous> (/node_modules/sqlite-vec/index.cjs:1:1)\n  at sqliteVec.load (/src/repo/store.ts:14:3)\n[jest --experimental-vm-modules emitted 14 similar errors across 6 test files]",
          is_error: true,
        },
      ],
    },
    {
      role: "assistant",
      content:
        "jest's experimental-vm-modules can't dual-load sqlite-vec because it's a CJS native module imported into our ESM tree. " +
        generateFiller(10003, 4500),
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f8_b",
          name: "WebFetch",
          input: {
            url: "https://github.com/jestjs/jest/issues/9430",
            prompt: "Is jest planning native ESM support?",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f8_b",
          content:
            "Tracking issue from 2020, still open. Native ESM support remains experimental. Recommended workaround: use vitest, which is jest-compatible and ESM-native.",
        },
      ],
    },
    {
      role: "user",
      content:
        "Yeah, this has been on our radar. Let's just do the migration. Move the test runner from jest to vitest across all packages. The CI failure is the trigger — it's not going to get better on jest.",
    },
    {
      role: "assistant",
      content:
        "Right — full migration to vitest. Replacing jest config with vitest.config.ts per package, updating package.json scripts, updating CI. Starting now.",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_f8_c",
          name: "Bash",
          input: { command: "pnpm test", description: "Verify after migration" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_f8_c",
          content: "Test Files  18 passed (18)\n     Tests  142 passed (142)\n  Duration  6.78s",
        },
      ],
    },
    { role: "user", content: "Green across the board. Push the change?" },
  ],
};

export const TOOL_FAILURES: Scenario[] = [F1, F2, F3, F4, F5, F6, F7, F8];
