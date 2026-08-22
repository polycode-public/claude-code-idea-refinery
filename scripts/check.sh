#!/usr/bin/env bash
# scripts/check.sh — the cheap gate: syntax-check every script, parse the
# caps file, then run the test suite.
set -euo pipefail
cd "$(dirname "$0")/.."

while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find scripts -name '*.sh' -print0)

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find src -name '*.mjs' -print0)

node -e "JSON.parse(require('node:fs').readFileSync('caps.json', 'utf8'))"

npm run -s lint-buckets
npm test
