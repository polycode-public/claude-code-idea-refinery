---
name: refinery-run
description: Start, inspect, or stop the running loops.
---

# Refinery run

Wraps `scripts/refinery.sh`. It never edits the ideas-* buckets or `mail/` itself.

## Up (default, or `up`)

Run `npm run -s refinery -- up`. If the operator said "cruise", pass
`--profile cruise`; otherwise leave the profile at its sprint default. Then run
`npm run -s refinery -- status` and report the per-agent lines back to the operator.

The refinery never starts over uncommitted tracked changes. `refinery.sh` refuses on its
own with a clean exit. Don't work around it; explain to the operator that the worktree
needs a clean `git status` first and name what's dirty.

## Status

Run `npm run -s refinery -- status` and report it: window state, last wake, today's
wakes and spend, `.err` line count, one line per agent.

## Down

Before running it, warn the operator. `refinery.sh down` touches `STOP` and then blocks
until every loop window exits on its own, which can take as long as the slowest
sleeper's interval. If the operator wants a number, check `caps.json` for the longest
`sprintSeconds` or `cruiseSeconds` among running agents. While the tmux
session is alive, `STOP` must never be removed by hand; only `refinery.sh down` removes
it, once every window has actually exited.

Once the operator confirms, run `npm run -s refinery -- down`.
