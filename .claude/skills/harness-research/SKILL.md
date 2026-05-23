---
name: harness-research
description: "Research and document the internal mechanics of AI coding harnesses (hooks, tool systems, APIs, configuration) as exhaustive per-item spec files organized by harness. Use when adding reference docs for harness internals, comparing how multiple harnesses implement a system, or when the user says \"research harness hooks\", \"document the X system for these harnesses\", \"create harness reference docs\", \"add docs for this harness\"."
---

A harness research task produces a library of spec-level reference files — one file per item (hook, tool, API endpoint), one directory per harness, nested under a topic subdirectory. The goal is exhaustive accuracy: every field name, every trigger condition, every edge case documented, not summarised.

## Phase 1 — Scope

Resolve these four questions before spawning any agents. Each has a default; only ask when the user's request contradicts the default or leaves it genuinely ambiguous:

- **Harnesses** — which harnesses to cover (e.g. codex, copilot, opencode, and any others). Default: all harnesses referenced in the project's harness docs.
- **Topic** — what system or feature to document (e.g. hooks, tools, MCP integration). No default — must be explicit.
- **Output root** — where to write the files. Default: `docs/` in the project root.
- **Granularity** — one file per item (hook, tool, command) vs. one file per category. Default: one file per item.

If the topic was provided as part of the invocation, skip asking and proceed directly to decomposition.

## Phase 2 — Decompose

Create one research angle per harness. State for each:
- Harness name
- One-sentence scope (what to find about the topic for this harness)
- Likely primary sources (official docs site, GitHub repo, changelog)

Present all angles to the user and confirm before spawning researchers.

## Phase 3 — Research

Spawn one researcher per harness in parallel. All run simultaneously.

Brief each researcher with:
- Their harness and topic
- The primary sources identified in decomposition
- The quality bar: **spec-level and exhaustive** — every item the harness exposes, every field, every edge case, every semantic meaning of exit codes or return values. Not summaries.
- Return format: structured raw data with one heading per item, sub-headings for: Trigger, Input Shape, Output Shape, Exit Codes / Response Codes, Config Example, Notes. No prose paragraphs.
- If the harness does not support the topic at all: document that explicitly and describe what alternatives (if any) exist.

Wait for all researchers to complete before proceeding.

## Phase 4 — Write

Spawn one writer per harness in parallel. All run simultaneously.

Each writer receives:
- The full, untruncated research output for their harness
- The output path: `<output-root>/<harness>/<topic>/`
- Instructions to create one `.md` file per item, named using that item's canonical name as used by the harness itself
- A `_config.md` for shared mechanics — handler types, execution model, common input/output fields, exit code table — when the harness has infrastructure shared across all items

Per-file content standard:
- Trigger / when it fires
- Matcher or filter mechanism (if any)
- Full input shape with every field, type, and description
- Full output shape with every field, type, and description
- Exit code / response code semantics
- A working config or registration example
- Edge cases and gotchas

Do not summarise. Do not omit fields. If a field is reserved or experimental, say so explicitly.

## Phase 5 — Index

After all writers finish, update the project's primary instructions file to add a pointer to `<output-root>/<harness>/<topic>/`. The pointer should tell future sessions: read these files before making implementation decisions involving that topic for any of the covered harnesses, rather than relying on training data.

## Gotchas

**Researcher output quality** — the research brief must explicitly request "structured raw data with headings per item". Without this, researchers default to prose summaries, which are too lossy to drive spec-accurate files.

**Writer truncation** — writers must receive the full research output verbatim in their prompt. Summarising before passing it to writers produces incomplete specs; the detail that looks redundant is often the edge case that matters.

**Missing features** — when a harness doesn't have the feature, the natural failure mode is a researcher who either guesses or silently skips items. Brief researchers explicitly: if the harness has no equivalent, return a clear negative finding that names what the harness offers instead.

**Canonical naming** — file names should use the item name as the harness itself names it (e.g. `PreToolUse.md` for one harness, `preToolUse.md` for another). Do not normalise casing across harnesses — the divergence reflects real API differences and is meaningful to readers comparing harnesses.
