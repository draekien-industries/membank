#!/usr/bin/env bash
set -euo pipefail

if command -v fallow >/dev/null 2>&1; then
  run_fallow() { fallow "$@"; }
elif [ -x ./node_modules/.bin/fallow ]; then
  run_fallow() { ./node_modules/.bin/fallow "$@"; }
elif command -v yarn >/dev/null 2>&1 \
  && FALLOW_BIN="$(yarn bin fallow 2>/dev/null)" \
  && [ -n "$FALLOW_BIN" ]; then
  run_fallow() { yarn exec fallow -- "$@"; }
else
  exit 0
fi

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [ -n "$UPSTREAM" ]; then
  BASE="$(git merge-base "$UPSTREAM" HEAD 2>/dev/null || echo "$UPSTREAM")"
else
  BASE="main"
fi

run_fallow audit --base "$BASE" --quiet --gate-marker pre-commit
