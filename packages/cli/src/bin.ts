#!/usr/bin/env node
import "@membank/core/suppress-warning";

// Deferred: node:sqlite emits its ExperimentalWarning during module linking, before any
// imported module body runs. Only a dynamic import lands the whole graph after the patch.
await import("./index.js");
