## Design Context

### Users
Developers and engineers who use AI coding tools (Claude Code, GitHub Copilot, Codex, opencode). They open the dashboard to manage memories that have accumulated on their machine over many sessions. Use case priority: **search → audit → triage → statistics**. Search is the entry point — everything else flows from finding something.

Think: password manager UX but for LLM context. Personal, private, on-machine data. The user needs to trust what they're looking at.

### Brand Personality
**Knowledgeable, trustworthy, fast.**

The product *knows things about the user* and they need to trust it with that. It should feel like a well-engineered internal tool — not a marketing site, not a toy. Confident and precise without being cold.

### Aesthetic Direction
Dark-first (light mode supported). Terminal-native tool that earned a proper UI.

References that land: Meilisearch (search-first, polished, light), Retool (structured data, power-user, sidebar+table), Raycast (refined dark, spotlight-search energy, fast-feeling).

Anti-reference: Datasette — deliberately plain/raw, zero design investment.

**Theme**: Dark primary, like the terminals it lives alongside. Light mode as a supported alternative, not an afterthought.

**Visual tone**: High information density done cleanly. Structured layouts with clear hierarchy. Search box as the hero. Tables and lists as primary content surfaces. No decorative chrome — every visual element earns its place.

### Design Principles

1. **Search is first-class** — the query input is the most prominent element on every view. Filtering and narrowing should feel instantaneous.
2. **Trust through clarity** — memory content is personal. Layout should make it easy to read, scan, and assess individual records without noise.
3. **Density without clutter** — developers tolerate high information density; they hate visual bloat. Tight spacing, strong typographic hierarchy, no padding for padding's sake.
4. **Dark by default** — the primary experience is dark, like the terminals and editors this tool lives alongside. Light mode is real, not token-swapped.
5. **Speed as a feeling** — transitions and interactions should feel immediate. No loading spinners where optimistic UI works. No animations that delay perception of responsiveness.
