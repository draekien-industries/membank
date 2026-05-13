---
"@membank/mcp": minor
---

Added SynthesisEngine for background memory synthesis via Claude Haiku. Adaptive 45s debounce, per-scope in-flight guards, SHA-256 drift detection, 30-day TTL. Synthesis replaces verbatim pinned injection when available; falls back gracefully when absent or in-flight.
