---
name: refinery-cycle
description: Run one wait-less serial pass of the whole funnel (or named agents).
---

# Refinery cycle

Wraps `scripts/cycle.sh`, the funnel pass that wakes each agent once, in order, with no
sleeps between wakes. Use it when the operator wants the refinery to move now rather
than wait out the standing loop intervals.

If the tmux session `refinery` is running, say so before doing anything else. The
continuous refinery and a cycle must never run at the same time. Offer to run
`/refinery-run down` first, or wait for the operator to stop it themselves.

Otherwise, run `npm run -s cycle --` with whatever arguments the operator gave.
`-n N` runs more than one cycle; a list of agent names restricts the pass to
those agents in the order given.

When it finishes, summarise what moved:

- New commits since the run started: `git log --oneline` from before to after.
- Bucket counts: how many idea files sit in each ideas-* bucket now.
- The top of `RANKED.md`.

If a cycle stopped early (`progress=0` on its last line), say so plainly. That cycle
found nothing to move, not an error.
