---
paths:
  - '**/*.tsx'
---

# React Rules

## Components

- Use the `shadcn` skill to identify primitives that can be installed and used before you roll your own
- Follow `react-composition-rules` skill guidelines when creating React components
- Use the TanStack React-DB library for fetching and syncing data instead of rolling your own fetching logic

## Tailwind

- If you register a css variable, add it into the `@theme inline` section of the stylesheet so that you can use canonical class names
- Prioritize using canonical class names over custom css variables
