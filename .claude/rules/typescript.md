---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript conventions

## Compiler settings (enforced via tsconfig.json)

- `strict: true` — all strict checks on
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`
- `module: NodeNext` + `moduleResolution: NodeNext` — ESM with explicit `.js` extensions on imports
- `target: ES2022`

## Module system

- ESM throughout — all packages have `"type": "module"` in package.json
- Import paths must include `.js` extension (NodeNext resolution requirement)
- No CommonJS (`require`, `module.exports`)

## Types

- Never use `any`. Fix the root type instead
- Prefer specific types over `unknown[]` — if all values are a known type, use that type
- Use `type` imports (`import type { ... }`) for type-only imports
- Narrow types at boundaries (user input, external APIs) — trust internal code and framework guarantees
- Use `as const` for readonly arrays, objects, and string literals — preserves literal types and prevents accidental mutation
- Use `satisfies` to validate a value against a type without widening it — prefer `satisfies` over type annotations when you need inference to flow through (e.g. `const config = { ... } satisfies Config`)
- Combine `as const satisfies T` when you need both literal narrowing and shape validation

## Lint suppression

- `// biome-ignore` is **forbidden** unless there is genuinely no other solution
- Always resolve the underlying type or lint issue rather than suppressing it
- If a suppression is truly unavoidable, the comment must explain exactly why no fix is possible

## Comments

- No comments that describe what the code does — well-named identifiers do that
- Only add a comment when the WHY is non-obvious: a hidden constraint, subtle invariant, or workaround for a specific external bug
- No multi-line comment blocks or docstrings

## Code style

- Minimum code that solves the problem — no speculative abstractions
- No error handling or validation for scenarios that cannot happen
- No backwards-compatibility shims for removed code
