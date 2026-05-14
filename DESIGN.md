---
name: Membank Dashboard
description: LLM memory manager — search, audit, and triage your AI coding context.
colors:
  context-green: "oklch(0.55 0.14 165)"
  context-green-light: "oklch(0.48 0.12 165)"
  surface: "oklch(0.13 0.008 165)"
  surface-raised: "oklch(0.18 0.008 165)"
  surface-muted: "oklch(0.22 0.007 165)"
  surface-light: "oklch(0.985 0.005 165)"
  surface-raised-light: "oklch(0.975 0.004 165)"
  ink: "oklch(0.96 0.006 165)"
  ink-light: "oklch(0.16 0.008 165)"
  ink-subdued: "oklch(0.62 0.008 165)"
  border: "oklch(1 0 0 / 10%)"
  border-light: "oklch(0.88 0.006 165)"
  destructive: "oklch(0.7 0.19 22)"
  destructive-light: "oklch(0.577 0.245 27.325)"
  type-correction: "oklch(0.72 0.16 25)"
  type-preference: "oklch(0.68 0.14 250)"
  type-decision: "oklch(0.65 0.14 300)"
  type-learning: "oklch(0.65 0.14 165)"
  type-fact: "oklch(0.62 0.006 165)"
  type-stale: "oklch(0.75 0.14 75)"
typography:
  body:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "0.75rem"
    lineHeight: 1.625
  label:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.05em"
  title:
    fontFamily: "Space Grotesk Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  sm: "0.27rem"
  md: "0.36rem"
  lg: "0.45rem"
  xl: "0.63rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.context-green}"
    textColor: "oklch(0.14 0.01 165)"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-primary-hover:
    backgroundColor: "oklch(0.55 0.14 165 / 0.8)"
    textColor: "oklch(0.14 0.01 165)"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-subdued}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-ghost-hover:
    backgroundColor: "oklch(0.22 0.007 165 / 0.5)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-outline:
    backgroundColor: "oklch(0.18 0.012 165)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  badge-type:
    backgroundColor: "oklch(0.55 0.14 165 / 0.15)"
    textColor: "{colors.context-green}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.375rem"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-subdued}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.375rem"
  input-search:
    backgroundColor: "oklch(1 0 0 / 0.12)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "1.75rem"
    padding: "0.125rem 1.75rem 0.125rem 0.5rem"
---

# Design System: Membank Dashboard

## 1. Overview

**Creative North Star: "The Terminal Curator"**

Membank Dashboard is a tool that earned its UI. It lives in the same environment as the terminals and code editors that generate its data — and it looks like it belongs there. Dark-first, monospace-bodied, information-dense without clutter. The design priority is trust: developers need to see their personal AI context clearly, scan it quickly, and modify it confidently. Decoration is a liability.

The system rejects the visual language of consumer SaaS: no gradient text, no glassmorphism, no hero-metric tiles, no dashboard clichés that signal "data tool" before the data does. It also explicitly rejects the aesthetic of Datasette — deliberately plain, zero design investment. This is the opposite: Datasette-class function, Raycast-class finish. The closest references are Raycast (refined dark, keyboard-first, fast-feeling) and Retool (structured data, power-user layout), filtered through the constraint that this tool lives on a developer's local machine, not in a browser tab.

Color is a single green-tinted axis (oklch hue 165) with one muted accent and a five-color semantic vocabulary for memory classification. Type-badge colors are classification signals, not decoration. Every visual element earns its place by carrying either structure or meaning — never both, never neither.

**Key Characteristics:**
- Monospace body text throughout — the terminal is the reference frame
- Keyboard-first; search box is always `/`, navigation is `↑↓`, delete requires two deliberate presses
- Five-color semantic palette encoding memory type classification
- Tonal depth only — no box shadows at any surface
- Dual-mode with genuine dark-first character; light mode is a real alternative, not a token-swap afterthought

## 2. Colors: The Context Axis

The palette is a single hue (oklch 165°, muted teal-green) running from near-black to near-white, punctuated by one accent and a controlled semantic palette. Every neutral in this system has a micro-tint toward the primary hue. Pure black and pure white are absent.

### Primary
- **Context Green** (`oklch(0.55 0.14 165)` dark / `oklch(0.48 0.12 165)` light): The sole interactive accent. Used on active primary buttons, pinned-state icon fills, keyboard focus rings (at 40% opacity), and the `type-learning` badge. Chroma is deliberately muted so it reads as signal, not decoration. Its rarity is the point — if a surface feels green, the design has failed.

### Neutral
- **Terminal Surface** (`oklch(0.13 0.008 165)` / light: `oklch(0.985 0.005 165)`): Primary background. Near-black (dark) / near-white (light) with a barely-perceptible green micro-tint — enough to feel intentional, invisible enough to read as neutral.
- **Raised Surface** (`oklch(0.18 0.008 165)` / light: `oklch(0.975 0.004 165)`): Cards, detail panel, sidebar. One tonal step above the base; no shadow required.
- **Muted Surface** (`oklch(0.22 0.007 165)` / light: `oklch(0.94 0.004 165)`): Hover fills, secondary background, selection states.
- **Ink** (`oklch(0.96 0.006 165)` / light: `oklch(0.16 0.008 165)`): Primary body text.
- **Ink Subdued** (`oklch(0.62 0.008 165)` / light: `oklch(0.52 0.006 165)`): Labels, metadata, timestamps, filter-row secondary text, group header text.
- **Border** (`oklch(1 0 0 / 10%)` dark / `oklch(0.88 0.006 165)` light): All dividers. In dark mode, white at 10% alpha; in light mode, tinted gray. Creates structural delineation without visual weight.
- **Destructive** (`oklch(0.7 0.19 22)` dark / `oklch(0.577 0.245 27.325)` light): Delete actions, error states, review-flagged indicators. Orange-red — never orange-only, never pure red.

### Tertiary — Semantic Type Palette
Five colors, each reserved exclusively for one memory type classification badge and its associated UI states:

- **Correction** (`oklch(0.72 0.16 25)`): Orange. The most urgent type, highest priority signal.
- **Preference** (`oklch(0.68 0.14 250)`): Blue. Stable, architectural choices.
- **Decision** (`oklch(0.65 0.14 300)`): Violet. One-time resolved choices.
- **Learning** (`oklch(0.65 0.14 165)`): Context Green. Growth, newly acquired information.
- **Fact** (`oklch(0.62 0.006 165)`): Neutral-gray. Reference data, low signal urgency.
- **Stale** (`oklch(0.75 0.14 75)`): Amber. Time-decay warning applied to synthesis state.

### Named Rules
**The One Accent Rule.** Context Green appears on at most 10% of any screen. Badge fills use 15% opacity. If you can call a surface "green" at a glance, the rule has been violated.

**The Semantic Palette Rule.** The five type colors are classification signals, never decorative fills. Do not reuse correction orange for generic warnings. Do not reuse preference blue for links or active state. Each color has exactly one meaning.

## 3. Typography: The Mono Register

**Body Font:** Geist Mono Variable (with `monospace` fallback)
**Content Font:** Space Grotesk Variable (with `sans-serif` fallback)

**Character:** Monospace as a design statement, not a fallback. The entire interface — labels, lists, search, metadata, filter controls — runs in Geist Mono Variable. Space Grotesk Variable appears only in the textarea where users write memory content, creating a deliberate register shift: the tool speaks mono, the user speaks in prose. This single pairing carries the entire typographic identity.

### Hierarchy
- **Title** (Space Grotesk Variable, 500, `0.875rem`, 1.625): Memory content in the detail panel textarea. The only non-mono surface in the system.
- **Body** (Geist Mono Variable, 400, `0.75rem`, 1.625): Memory preview text, all primary list content. Line length constrained by the split-pane layout (~60ch).
- **Label** (Geist Mono Variable, 400, `0.6875rem` / `11px`, uppercase, `letter-spacing: 0.05em`): Section group headers, field labels, filter row metadata, count footers. Never bold — weight stays at 400, case and tracking carry the hierarchy.
- **Micro** (Geist Mono Variable, 400–500, `0.625rem` / `10px`): Badge text, date stamps, ID references. The floor — nothing below this size.

### Named Rules
**The Mono-First Rule.** If you reach for Space Grotesk outside of memory content in the textarea, stop. The mono register is the system's identity. Dialog titles, form labels, empty states, tooltips — all mono.

**The No-Scale Rule.** There is no display or headline size. The largest text in the system is the modal title (approximately `0.875rem`). Hierarchy is achieved through weight, case, tracking, and color — never through font size alone.

## 4. Elevation: Tonal Layering Only

This system uses tonal layering exclusively. Box shadows are prohibited at every surface, at rest and on interaction.

Depth is expressed as a sequence of background lightness steps: Terminal Surface (L≈0.13) → Raised Surface (L≈0.18) → Muted Surface (L≈0.22). Cards and the detail panel use Raised Surface — visually distinct from the list pane base without any border or shadow. Hover states shift to Muted Surface via `bg-accent/40`. Selection states use `bg-accent/60`.

Focus rings are the one exception: a 1px inset ring in Context Green at 40% opacity (`ring-1 ring-inset ring-primary/40`) marks keyboard focus. This is structural, not decorative.

### Named Rules
**The No-Shadow Rule.** If you reach for `box-shadow` (excluding focus rings), the design has broken. Add a tonal background step instead. Shadows do not exist in this vocabulary.

**The Flat-at-Rest Rule.** Surfaces do not lift on hover. Background tint changes; geometry does not. The `translate-y-px` on button `:active` is the only physical metaphor permitted, and it is a 1px press — not a lift.

## 5. Components

### Buttons
Clinical precision — compact, functional, no decorative chrome. Controls disappear when not needed and respond with exact state transitions when they are.

- **Shape:** Softly squared (0.36rem radius). Not pill-shaped, not sharp-cornered.
- **Primary:** Context Green background (`oklch(0.55 0.14 165)`), near-black text. Height `1.75rem` (h-7). Horizontal padding `0.5rem` (px-2). Font weight 500, monospace. Hover fades to 80% opacity.
- **Ghost:** Transparent at rest, Muted Surface fill on hover (`bg-muted/50`). Used for icon actions in list rows, theme toggle, filter toggles. It disappears until needed — that is the point.
- **Outline:** `bg-input/30` base with `border-border`, hover fills to `bg-input/50`. Used for secondary confirm-style actions (Mark reviewed, Keep editing).
- **Destructive:** `bg-destructive/20` base, destructive text, ring on focus. Not used for the delete button itself — the delete sequence uses ghost until confirming state.
- **Icon variants:** Three sizes — `icon-xs` (20×20px), `icon-sm` (24×24px), `icon` (28×28px). Icons are 14px, 12px, and 14px respectively.
- **Hover / Focus:** `translate-y-px` on `:active:not(aria-expanded)`. `border-ring` + `ring-2 ring-ring/30` on `:focus-visible`.

### Badges / Type Chips
The primary classification affordance. Always readable at `0.625rem` (10px). Always paired with a 15%-opacity background tint in the type color.

- **Type variants** (correction, preference, decision, learning, fact): Background is `var(--type-X) / 15%`, text is `var(--type-X)`. Border radius 0.27rem (sm).
- **Outline variant:** `border-border`, `text-muted-foreground`. Used for freeform tags on memory rows — they carry content, not classification.
- **Secondary / pill variant:** `bg-secondary`, `rounded-full`. Used for project association pills in the detail panel. The pill shape signals "removable" through convention.

### Memory Row (Signature Component)
The primary content surface. A list item carrying type badge + preview text + metadata in approximately 56px of vertical space (py-3, gap-1.5, two rows).

- **Background:** Transparent at rest. `bg-accent/40` on hover. `bg-accent/60` when selected. `bg-accent/20` when keyboard-focused but not selected.
- **Focus indicator:** `ring-1 ring-inset ring-primary/40` — an inset green ring distinguishes keyboard focus from mouse hover without layout shift.
- **Action visibility:** Pin and Trash buttons are `opacity-0` at rest, transitioning to `opacity-100` on group hover or focus-within. The Pin button stays fully visible when the memory is already pinned.
- **Delete confirmation:** Two-click pattern. First click enters confirming state (Trash icon fills, button background becomes `bg-destructive/10`). Second click executes. `onMouseLeave` cancels pending confirmation.
- **Metadata row:** At `pl-[42px]` to clear the badge. Tags (outline badges), review warning icon, scope label, updated-at date — all 11px, right-aligned, separated by layout gap.
- **Border:** `border-b border-border` only. No side borders, no shadow, no card frame.

### Inputs / Fields
- **Style:** Height `1.75rem`, `border-input`, `bg-input/20` (dark: `/30`), radius 0.36rem. The border is the field — no background fill that competes with the content.
- **Focus:** `border-ring` + `ring-2 ring-ring/30`. Ring replaces any border-color shift.
- **Error:** `aria-invalid` attribute drives `border-destructive` + `ring-destructive/20` automatically.
- **Search field:** Includes a leading MagnifyingGlass icon (14px, `text-muted-foreground`) positioned at `left: 0.625rem`. Left padding increases to `pl-7` (1.75rem) to clear the icon. The search field is the visual focal point of the list pane.
- **Textarea:** Identical treatment to Input, but multi-line. Font overridden to Space Grotesk Variable — the register shift that marks "this is where you write."
- **Select (native):** Same height and border treatment as Input. Uses `NativeSelect` rather than a custom dropdown to avoid focus management complexity.

### Group Headers
Sticky section dividers for the time-grouped memory list.

- **Style:** `text-[11px]` uppercase `tracking-wide`, `text-muted-foreground`. White-space minimal — label left, count right.
- **Sticky behavior:** `sticky top-0 z-10` with `bg-background/95 backdrop-blur`. The 95% opacity + blur prevents content bleeding through while scrolling. This is the only legitimate use of backdrop-filter in the system.
- **Interactivity:** Collapse toggle — the entire header row is a button. `hover:text-foreground` confirms interactivity. No chevron icon; the interaction is discoverable through hover state alone.
- **Border:** `border-b border-border` bottom only.

### App Header / Navigation
Single-level, fixed 44px bar.

- **Logo:** Left-aligned. `MemoryLogo` component — not documented as typography, not swappable.
- **Stats bar:** Center. Badge-per-type row showing global memory counts by classification. Separators are `·` in `text-border`. Total count at far left in `text-xs text-muted-foreground`.
- **Theme toggle:** Ghost icon-sm button, right-aligned. Sun (in dark mode, to switch to light) / Moon (in light mode, to switch to dark). No label; the icon is the label.
- **No sidebar.** Routes are flat. The split pane (list + detail) is the only layout. Navigation happens through the list, not through nav items.

## 6. Do's and Don'ts

### Do:
- **Do** use Context Green exclusively for interactive state — active buttons, pin indicators, keyboard focus rings. Its rarity makes it mean something.
- **Do** build depth through opacity tiers (15%, 20%, 40%, 60%) off a single base color rather than reaching for new fills.
- **Do** keep all body and label text in Geist Mono Variable. The mono register is the design's identity.
- **Do** use the two-click delete pattern for every destructive action — first click enters confirming state with destructive styling, second click executes.
- **Do** reveal list row actions (Pin, Trash) on hover/focus-within via `opacity-0 → opacity-100`. Controls should disappear unless needed.
- **Do** use `11px uppercase tracking-wide text-muted-foreground` for all section labels and field headers — it is the system's single label voice.
- **Do** keep the semantic type palette exclusive: correction orange only on corrections, preference blue only on preferences, and so on.
- **Do** use `aria-invalid` to drive error states on inputs — the styling follows automatically.
- **Do** make Space Grotesk Variable the signal that "this is editable memory content." Reserve it for the textarea only.

### Don't:
- **Don't** add box shadows to any surface. This design is tonal-only. Reach for a background-lightness step instead.
- **Don't** use border-left or border-right as a colored stripe accent. The only structural borders in this system are border-bottom row dividers and full-perimeter borders on review-event cards.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight, case, tracking, or the semantic palette.
- **Don't** use glassmorphism decoratively. The one legitimate use is `backdrop-blur` on sticky group headers (95% opaque background — structural, not decorative).
- **Don't** let the design drift toward Datasette: plain, raw, zero design investment. The goal is Datasette-class function with Raycast-class finish.
- **Don't** use Space Grotesk Variable outside of memory content in the textarea. The tool speaks mono.
- **Don't** reuse the five type-badge colors for non-classification purposes. Correction orange is not a general warning color. Preference blue is not a link color.
- **Don't** build card grids. Primary content surfaces are lists and split-pane detail views.
- **Don't** animate layout properties (height, width, padding). State transitions may animate `opacity`, `transform`, and `background-color` only.
- **Don't** make the interface feel like a SaaS marketing dashboard: no hero metrics with gradient accents, no identical icon-grid cards, no modal-as-first-thought patterns.
