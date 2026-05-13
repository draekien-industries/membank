# Ubiquitous Language Index

<!-- Last validated: 2026-05-06 -->

## Bounded Contexts

Domain contexts (live in `packages/core`):
- **Memory** — entities, repository, dedup logic — [packages/core/UBIQUITOUS_LANGUAGE.md](packages/core/UBIQUITOUS_LANGUAGE.md)
- **Query** — semantic search engine, scoring
- **Embedding** — model loading, vector generation
- **Persistence** — SQLite/sqlite-vec storage, migrations
- **Project** — working directory identity, associations
- **SessionInjection** — stats + pinned memory bundle for harness session start
- **Synthesis** — agent-driven memory summarization (currently split across core + mcp)
- **Configuration** — runtime config resolution

Presentation contexts (call into the domain contexts above, own no business logic):
- **CLI** — `packages/cli` — terminal commands, stdout formatting, setup wizards
- **MCPServer** — `packages/mcp` — stdio MCP tool adapters
- **Dashboard** — `packages/dashboard` — web UI, HTTP server adapter

## Architectural Terms

Canonical definitions for the layered architecture targeted by the in-flight restructure live in [plans/36-core-business-logic-restructure.md](plans/36-core-business-logic-restructure.md):

- **DomainLayer** — pure code: entities, value objects, business policies. No Node-only imports. Lives in `core/src/<context>/domain/`.
- **ApplicationLayer** — use-cases that orchestrate domain + ports. Lives in `core/src/<context>/application/`.
- **InfrastructureLayer** — adapters implementing ports against external systems (SQLite, Hugging Face, Claude Agent SDK). Lives in `core/src/<context>/infrastructure/`.
- **Port** — interface defined in a context's `ports.ts`, consumed by application, implemented by infrastructure or by another context's adapter.
- **UseCase** — a single application-layer function (e.g. `saveMemory`, `runSynthesis`). The unit of API surface exposed to presentation packages.
- **PresentationPackage** — `cli`, `mcp`, or `dashboard`. Calls use-cases; owns no business logic. May not import from any `infrastructure/` folder.
- **LockedSurface** — a public boundary that must remain byte-identical across the restructure: CLI commands, MCP tools, DB schema, dashboard `/api/*` routes.
