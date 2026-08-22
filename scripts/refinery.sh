#!/usr/bin/env bash
# scripts/refinery.sh — start, stop and inspect the standing refinery.
#
# Usage:
#   refinery.sh up [--profile sprint|cruise] [agent...]
#   refinery.sh down
#   refinery.sh status
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

SESSION="refinery"
STOP_FILE="STOP"

usage() {
  cat <<'EOF'
usage: refinery.sh <up|down|status> [options]

  up [--profile sprint|cruise] [agent...]   start one tmux window per loop agent
                                             (default: every sub-agent with a
                                             prompts/<agent>.md, except probe)
  down                                      touch STOP, wait for every loop to exit,
                                             kill the tmux session, remove STOP
  status                                    per agent: window state, last wake,
                                             today's wakes and spend, .err line count
EOF
}

default_agents() {
  local f name
  for f in "$REPO_ROOT"/prompts/*.md; do
    name="$(basename "$f" .md)"
    [[ "$name" == "probe" ]] && continue
    echo "$name"
  done | sort
}

session_exists() {
  tmux has-session -t "$SESSION" 2>/dev/null
}

cmd_up() {
  local profile="sprint"
  local agents=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        profile="${2:-}"
        shift 2
        ;;
      *)
        agents+=("$1")
        shift
        ;;
    esac
  done

  if [[ "$profile" != "sprint" && "$profile" != "cruise" ]]; then
    echo "refinery.sh: --profile must be sprint or cruise" >&2
    exit 1
  fi

  if [[ ${#agents[@]} -eq 0 ]]; then
    while IFS= read -r a; do agents+=("$a"); done < <(default_agents)
  fi
  for agent in "${agents[@]}"; do
    if [[ ! -f "$REPO_ROOT/prompts/${agent}.md" ]]; then
      echo "refinery.sh: no prompts/${agent}.md for agent '$agent'" >&2
      exit 1
    fi
  done

  if [[ -f "$REPO_ROOT/$STOP_FILE" ]]; then
    echo "refinery.sh: STOP is present; remove it before starting the refinery" >&2
    exit 1
  fi
  if session_exists; then
    echo "refinery.sh: tmux session '$SESSION' already exists" >&2
    exit 1
  fi

  local status_log
  status_log="$(mktemp)"
  git -C "$REPO_ROOT" status --porcelain > "$status_log" 2>&1
  if grep -v '^??' "$status_log" | grep -q .; then
    echo "refinery.sh: worktree has staged or modified tracked files; commit or clear them before starting the refinery" >&2
    rm -f "$status_log"
    exit 1
  fi
  rm -f "$status_log"

  tmux new-session -d -s "$SESSION" -c "$REPO_ROOT" -n "${agents[0]}" \
    "REFINERY_PROFILE=$profile bash scripts/loop.sh ${agents[0]}"
  for agent in "${agents[@]:1}"; do
    tmux new-window -t "$SESSION" -c "$REPO_ROOT" -n "$agent" \
      "REFINERY_PROFILE=$profile bash scripts/loop.sh $agent"
  done
  echo "refinery.sh: up, profile=$profile, agents: ${agents[*]}"
}

cmd_down() {
  touch "$REPO_ROOT/$STOP_FILE"
  echo "refinery.sh: STOP written, waiting for loop windows to exit"

  while tmux list-windows -t "$SESSION" >/dev/null 2>&1; do
    local remaining
    remaining="$(tmux list-windows -t "$SESSION" 2>/dev/null | wc -l | tr -d ' ')"
    echo "refinery.sh: waiting on $remaining window(s)"
    sleep 5
  done

  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -f "$REPO_ROOT/$STOP_FILE"
  echo "refinery.sh: down"
}

# Sums today's wakes and cost from an agent's own log the same way
# budget.mjs's cap check does, since budget.mjs exposes only a pass/fail
# exit code and no printable summary.
agent_wake_summary() {
  local log="$1"
  node -e '
    const fs = require("node:fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);
    let last = "never";
    let wakes = 0;
    let cost = 0;
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof entry.loggedAt === "string") last = entry.loggedAt;
      if (typeof entry.loggedAt === "string" && entry.loggedAt.slice(0, 10) === today) {
        wakes += 1;
        cost += Number(entry.total_cost_usd) || 0;
      }
    }
    console.log(`${last} ${wakes} ${cost.toFixed(2)}`);
  ' "$log"
}

cmd_status() {
  local agents=()
  while IFS= read -r a; do agents+=("$a"); done < <(default_agents)

  local live_windows=""
  if session_exists; then
    live_windows="$(tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null)"
  fi

  for agent in "${agents[@]}"; do
    local window_state="down"
    if [[ -n "$live_windows" ]] && grep -qx "$agent" <<< "$live_windows"; then
      window_state="up"
    fi

    local log="$REPO_ROOT/logs/${agent}.jsonl"
    local last_wake="never"
    local wakes_today=0
    local cost_today="0.00"
    if [[ -f "$log" ]]; then
      read -r last_wake wakes_today cost_today < <(agent_wake_summary "$log")
    fi

    local err="$REPO_ROOT/logs/${agent}.err"
    local err_lines=0
    [[ -f "$err" ]] && err_lines="$(wc -l < "$err" | tr -d ' ')"

    echo "$agent: window=$window_state last-wake=$last_wake wakes-today=$wakes_today cost-today=\$$cost_today err-lines=$err_lines"
  done
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    ""|-h|--help)
      usage
      [[ -z "$cmd" ]] && exit 1
      exit 0
      ;;
    up)
      shift
      cmd_up "$@"
      ;;
    down)
      shift
      cmd_down
      ;;
    status)
      shift
      cmd_status
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
