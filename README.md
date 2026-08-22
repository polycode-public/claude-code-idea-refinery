# The Idea Refinery

A community project built on Anthropic's Claude Code. Not affiliated with or endorsed by
Anthropic.

The Idea Refinery is a set of Claude Code sub-agents running as background loops. Each
loop wakes on an interval, does one narrow job on the funnel (seed, score, challenge,
refine, plan, rank), commits its work, and sleeps. The sub-agents coordinate through
file-based mail, every idea is a markdown document in this repository, git is the audit
log, and you steer it as the overseer and have the final word.

This repository is a template. You get the machinery and an empty funnel. The ideas are
yours to grow.

## Prerequisites

- Node 24 or later.
- The Claude Code CLI, logged in.
- tmux, for the continuous loops.
- git.
- A Voyage AI key. Embeddings drive the tagger's themes and the local retrieval index.

## First run

**1. Write your charter brief.** Open `CLAUDE.md` and replace the placeholder brief in
Part 1, "What the refinery looks for". This is the most important thing you will do here.
Every agent reads it on every wake, so it decides what kind of ideas you get. Keep the
three gates or rewrite them to fit your brief.

**2. Add your Voyage key.**

```
cp .env.example .env
```

Then put your key in `VOYAGE_API_KEY`. `.env` is gitignored. The key is read from `.env`
or the environment and never appears in output, including error messages.

**3. Log in to the Claude Code CLI.** The loops run `claude -p` non-interactively, so the
CLI has to be authenticated before you start them.

```
claude
```

**4. Install and check.**

```
npm install
npm run -s check
```

`check.sh` is the whole gate. It syntax-checks every script, parses `caps.json`, lints the
idea buckets, and runs the test suite. It must pass clean before anything else. The same
gate runs in CI on every push.

**5. Re-pin the CLI version if you are warned.** `caps.json` carries a `cliVersion` pin.
Every loop compares it against your `claude --version` on startup and prints a warning on
a mismatch. If you see that warning, set `cliVersion` in `caps.json` to your own version
and commit it. The pin exists so a CLI upgrade that changes flags or output shows up as a
warning rather than a silent run of broken wakes.

**6. Run one probe wake.** The probe proves the plumbing end to end and touches nothing
that matters.

```
npm run -s loop -- probe 5
touch STOP.probe
```

That starts the probe's loop with a 5-second interval. `touch STOP.probe` stops it at the
start of its next wake. A clean probe run proves `claude -p` invokes correctly, budget
accounting writes to `logs/probe.jsonl`, and a wake's changes commit on schedule.

**7. Start the refinery.**

```
npm run -s refinery -- up
```

Your first ideas appear in `ideas-0-seeds/` after the harvester's first wake, and move
along the funnel from there. Give it a few wakes before you judge what it found.

## Three ways to run it

**Continuous**, the normal way to leave the refinery running:

```
npm run -s refinery -- up [--profile sprint|cruise]
npm run -s refinery -- status
npm run -s refinery -- down
```

`up` opens one tmux window per loop agent and refuses to start if `STOP` is present or a
session is already up. `sprint` is the default profile, with shorter wake intervals, for
active grooming. `cruise` spaces wakes out for a refinery left running unattended. `status`
prints one line per agent with window state, last wake, today's wakes and spend, and error-log
size. `down` writes `STOP`, waits for every loop window to exit, including the slowest
sleeper mid-interval, then kills the tmux session and removes `STOP`.

**One serial pass**, for a single hands-on grooming run with no waiting between wakes:

```
npm run -s cycle -- [-n max_cycles] [agent ...]
```

With no arguments this wakes all twelve loop agents once each, in funnel order, and stops
early once a cycle changes nothing. Name agents to run only those. It refuses to run while
the tmux session is up, so stop the loops first.

**A single agent loop**, for watching one role work:

```
npm run -s loop -- <agent>
```

Stop one loop with `touch STOP.<agent>`. Stop everything with `touch STOP`. Every loop
checks for both at the start of its next wake.

## Reading the refinery

- `RANKED.md` — the current ordering of live ideas, one row per idea with its score,
  status and one-liner. The ranker rebuilds it from the idea documents; you can rebuild it
  yourself with `npm run -s ranked`. Read it top down to see what the refinery currently
  believes.
- `THEMES.md` — the tagger's theme digest: which clusters your live ideas fall into, how
  each is trending, and any funnel warning. A warning means one theme has taken over the
  funnel, which is your cue to send the wanderer somewhere else.
- `plans/` — the drafter's output for graduated ideas: a `PLAN_` file and its `REVIEW_`
  companion.
- `npm run -s report` — wakes and spend per agent, spend per ranked idea, bucket counts,
  survival rates, kill reasons by rubric axis, funnel warnings and mail volume.
- `git log --oneline` — the audit trail. Every wake commits its own work, so the history
  reads as a running account of what each agent did and when.

Ideas move through the numbered `ideas-*` buckets as they are seeded, scored, challenged,
refined and ranked, with `ideas-killed/` and `ideas-archive/` for the ones that don't
survive or that merged away. The `idea-doc` skill has the full lifecycle and who may write
where.

## Watching the refinery

```
npm run -s viz
```

Opens a read-only viewer at `http://127.0.0.1:4642`: the funnel board, an agent rail
with each loop's last wake and spend, the mail traffic between agents, and the rendered
idea documents and artifacts, all updating live as the loops write to the tree. It never
writes anything itself. To change what the refinery does, act as overseer or edit files
in Claude Code, not through the viewer.

## Steering it as overseer

You are the overseer. A directive from you outranks every other instruction an agent reads
on a wake. Send one with mail:

```
npm run -s mail -- send <agent> --from overseer [--re <id>]
```

The body goes in on stdin. See the `mail` skill for the block format and the hop-limit
rule. Use it to redirect the harvester at a sector, tell the challenger to press harder on
one claim, or overrule a score.

Two more levers:

- `ideas-operator-selected/` holds ideas you have pinned for priority grooming. All the
  sub-agents work them in place, and only you move a file in or out.
- Budgets live in `caps.json`: per-agent `dailyUsd`, `wakeUsd`, `dailyWakes`, and
  `sprintSeconds`/`cruiseSeconds` wake intervals. Retune them from `report.mjs` numbers
  rather than from argument.

STOP files halt loops at the start of their next wake: `STOP` for all of them,
`STOP.<agent>` for one. Never remove `STOP` while the tmux session is still alive. Wait
for `refinery.sh down` to finish removing it itself.

## Teaching it what you don't want

When you reject an idea, move it into `ideas-operator-rejected/` and write down why. The
reason belongs in `ideas-operator-rejected/REASONS.md`, as a named, standing pattern
rather than a one-off verdict. Give each entry a short pattern name, the idea it came
from, what the pattern is, and a test that decides whether a new idea matches it.

The harvester, wanderer, scorer and challenger read that file when it exists, and consult
it before seeding or scoring something that already failed once. A pattern there is your
judgment, not a law of nature: an idea matching one gets the match named in its score
comment and the matching axes weighed accordingly, never a silent kill.

The file does not ship with the template. Create it the first time you reject something,
and it starts working on the next wake.

## The sub-agents

| agent | model | duty |
|---|---|---|
| harvester | fable | seeds new ideas from live web signals into `ideas-0-seeds/` |
| wanderer | fable | seeds ideas deliberately outside the refinery's dominant themes |
| scorer | sonnet | scores seeded ideas by the rubric, moves each to `ideas-1-scored` or `ideas-killed` |
| challenger | fable | adversarial review of scored ideas, grounded in evidence fetched that wake |
| refiner | opus | synthesises contested comment threads into stronger idea documents |
| merger | haiku | proposes and executes idea merges from THEMES.md convergence candidates, subject to challenger veto |
| tagger | haiku | clusters live ideas via `themes.mjs` and writes the dated `THEMES.md` digest |
| fetcher | haiku | saves cited URLs from idea documents into `docs/` as local, indexable sources |
| indexer | haiku | runs `indexer.mjs` to bring new `docs/` pages into the local retrieval index |
| planner | opus | writes and maintains the "Steps to realise" section on top-ranked ideas |
| drafter | fable | turns a graduated, gate-clean idea into a draft realisation plan |
| ranker | haiku | rebuilds `RANKED.md` from idea header data, mechanically |
| probe | haiku | smoke test, verifies the plumbing and touches nothing that matters |

Model pins live in `.claude/agents/`. Change them to suit your budget.

## Tests and integrity

```
npm run -s check
```

Runs, in order: `bash -n` over every `scripts/*.sh`, `node --check` over every `src/*.mjs`,
a JSON parse of `caps.json`, `npm run -s lint-buckets`, and `npm test`. It needs no API
keys and no claude CLI, which is why the same command is the whole of CI.

`npm run -s lint-buckets` enforces one rule: one idea id lives in exactly one bucket, and
that bucket implies the idea's `status`. A violation prints and the script exits non-zero.
A duplicate id across buckets corrupts the ranking, so this check is part of the gate, not
a lint you can skip.

## Licence

MPL-2.0. See `LICENSE`.
