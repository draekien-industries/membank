# Client UI

React frontend for the Membank dashboard.

## Before writing UI code

1. Run `/shadcn` skill to search for an existing primitive before writing any new component implementation. Only hand-roll if shadcn has no equivalent.
2. Run `/react-composition-rules` skill in CREATE or DECOMPOSE mode before writing new **custom** components.

## Rules

- Follow all 11 React composition rules enforced by the `react-composition-rules` skill.
- **Never apply react composition rules to shadcn primitives** — treat them as black-box building blocks, not components to decompose or restructure.
- Use shadcn components from the project registry — do not hand-roll primitives that shadcn already provides.
- Check existing components in `components/` before creating new ones.

## Imports from @membank/core

**Never import from `@membank/core` in client code** — it pulls `better-sqlite3` and other Node.js-only native modules into the browser bundle. Use `@membank/core/client` instead.

`@membank/core/client` exports pure domain constants (currently `GLOBAL_SCOPE_HASH`, `GLOBAL_PROJECT_ID`, `GLOBAL_PROJECT_NAME`). To expose more values browser-side, add them to `packages/core/src/client.ts` (only import from `*/domain/` files to keep it Node-free) and rebuild core.
