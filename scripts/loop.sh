#!/usr/bin/env bash
# scripts/loop.sh <agent> [interval-seconds]
set -euo pipefail
AGENT="$1"
cd "$(dirname "$0")/.."
INTERVAL="${2:-$(npm run -s budget -- interval "$AGENT")}"

mkdir -p logs

CLI_VERSION="$(claude --version || true)"
CAP_VERSION="$(node -p "require('./caps.json').cliVersion" 2>/dev/null || true)"
if [[ -n "$CAP_VERSION" && "$CLI_VERSION" != "$CAP_VERSION"* ]]; then
  echo "[$AGENT] warning: claude --version ($CLI_VERSION) does not match caps.json cliVersion ($CAP_VERSION)"
fi

while true; do
  [[ -f STOP || -f "STOP.${AGENT}" ]] && { echo "[$AGENT] stopped"; exit 0; }
  npm run -s budget -- check "$AGENT" \
    || { echo "[$AGENT] over daily cap, dozing"; sleep 60; continue; }

  claude -p "$(cat "prompts/${AGENT}.md")" < /dev/null \
    --agent "$AGENT" \
    --max-budget-usd "$(npm run -s budget -- wake-cap "$AGENT")" \
    --output-format json \
    --no-session-persistence \
    --permission-mode dontAsk \
    --setting-sources project,local \
    2>> "logs/${AGENT}.err" | npm run -s budget -- log "$AGENT" || true

  git add 'ideas-*' mail docs RANKED.md THEMES.md 2>/dev/null || true
  git diff --cached --quiet || git commit -qm "${AGENT}: wake $(date -u +%FT%TZ)"
  sleep $(( INTERVAL + RANDOM % 60 ))
done
