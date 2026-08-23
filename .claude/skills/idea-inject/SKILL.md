---
name: idea-inject
description: Put one idea through the whole funnel, from operator prose or an existing id.
---

# Idea inject

Takes one argument: either a prose description of a business idea, or an existing idea
id (`idea-NNNN`, matching `ideas-*/idea-<id>-*.md`). Drives that one idea through the
funnel and reports what happened to it.

## Prose mode

The argument doesn't match `idea-\d{4}`; it's operator brief text.

Send it to the harvester as an overseer directive:

```
npm run -s mail -- send harvester --from overseer
```

Body on stdin: quote the operator's brief verbatim, then instruct the harvester to seed
exactly this one idea this wake, applying the charter's three gates and the idea-doc
format (see the `idea-doc` skill) honestly. If the brief fails a gate, the harvester
must not seed it. It mails the overseer why, naming the gate that failed.

Then run `npm run -s cycle -- -n 4` and watch the harvester's wake for a new file
under `ideas-0-seeds/`. That file's id is the idea this run tracks. If four cycles pass
with no new seed and no overseer mail explaining a gate failure, say so and stop.
Don't keep guessing at cycles.

## Id mode

The argument matches `idea-NNNN`. Find it:

```
ls ideas-*/idea-<id>-*.md
```

Read its `status:` header field and mail an overseer directive naming it as priority to
the role that owns its next step:

| status | mail to |
|---|---|
| `seeded`, or `scored` with no `score` value | scorer |
| `scored` | challenger |
| `contested` | refiner |
| `refined`, no `Steps to realise` section yet | planner |
| `refined` with steps present | ranker |

`npm run -s mail -- send <role> --from overseer`, body naming the idea id and asking
that role to prioritise it this wake.

## Both modes: run to a terminal state

Run `npm run -s cycle -- -n 4` (or continue the cycle already running from prose
mode) and re-read the idea's file after each cycle. Keep going, four cycles at a time,
until one of these holds:

- the idea sits in `ideas-4-ranked/`, or in `ideas-operator-selected/` with
  `status: ranked` — graduated;
- the idea sits in `ideas-killed/` — killed;
- two consecutive cycles leave the idea's file byte-identical — stalled, and worth
  telling the operator rather than cycling further.

Then report the idea's journey: every comment added to its `## Comments` section during
this run, in order; its score at each stage it changed; its final bucket and status;
and, if it stalled or was killed, what the document itself says is blocking it.
