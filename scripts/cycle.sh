#!/usr/bin/env bash
# scripts/cycle.sh [-n max_cycles] [agent ...]
#
# The wait-less serial funnel pass: wakes each agent once per cycle, in
# funnel order, with no sleep between wakes. Same claude invocation as
# scripts/loop.sh, run to completion rather than looped on an interval.
# Refuses to run alongside the standing refinery (tmux session "refinery"),
# since a cycle and the continuous loops must never touch the tree at once.
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION="refinery"
DEFAULT_AGENTS=(harvester wanderer fetcher indexer scorer challenger refiner tagger merger ranker planner drafter)

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "cycle.sh: tmux session '$SESSION' is running; stop the loops first (scripts/refinery.sh down)" >&2
  exit 1
fi

MAX_CYCLES=1
AGENTS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n)
      MAX_CYCLES="${2:-}"
      shift 2
      ;;
    *)
      AGENTS+=("$1")
      shift
      ;;
  esac
done
if [[ ${#AGENTS[@]} -eq 0 ]]; then
  AGENTS=("${DEFAULT_AGENTS[@]}")
fi

mkdir -p logs

if ! npm run -s lint-buckets; then
  echo "cycle.sh: bucket lint failed; fix the ideas-* buckets before running a cycle" >&2
  exit 1
fi

wake_agent() {
  local agent="$1"
  claude -p "$(cat "prompts/${agent}.md")" < /dev/null \
    --agent "$agent" \
    --max-budget-usd "$(npm run -s budget -- wake-cap "$agent")" \
    --output-format json \
    --no-session-persistence \
    --permission-mode dontAsk \
    --setting-sources project,local \
    --settings .claude/loop-settings.json \
    2>> "logs/${agent}.err" | npm run -s budget -- log "$agent" || true

  git add 'ideas-*' mail docs plans RANKED.md THEMES.md 2>/dev/null || true
  if ! git diff --cached --quiet; then
    git commit -qm "${agent}: wake $(date -u +%FT%TZ)"
    return 0
  fi
  return 1
}

cycle=0
while [[ "$cycle" -lt "$MAX_CYCLES" ]]; do
  cycle=$((cycle + 1))
  progress=0
  for agent in "${AGENTS[@]}"; do
    if ! npm run -s budget -- check "$agent"; then
      echo "cycle $cycle: $agent over daily cap, skipping"
      continue
    fi
    if wake_agent "$agent"; then
      progress=1
    fi
  done
  echo "cycle $cycle progress=$progress"
  if [[ "$progress" -eq 0 ]]; then
    break
  fi
done
