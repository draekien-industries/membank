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
