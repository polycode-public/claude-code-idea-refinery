---
name: idea-doc
description: The idea document format, who may edit what and where, and how ideas split and merge.
---

# Idea document

One markdown file per idea, named `<id>-<slug>.md` — the id, a dash, and a short
kebab-case slug of the title (three to six words). The id alone is the key everywhere
(mail `re:` lines, `parent` and `merged-into` links, the retrieval index); the slug is
for humans reading a directory listing. The front matter carries machine state; body
sections have a single writer at any time; the comments section is append-only for
everyone.

```markdown
---
id: idea-0042
title: Usage-billing proxy for indie API authors
status: contested            # seeded|scored|contested|refined|ranked|split|merged|killed
owner: challenger            # who may edit body sections right now
created: 2026-08-21T09:12Z
updated: 2026-08-21T11:40Z
tags: [api-monetisation, dev-tools, usage-billing]
score: 68
score-breakdown: {pain: 4, wtp: 4, inbound: 3, build: 4, cogs: 3, density: 2, risk: 4}
parent: null                 # set on splits
merged-into: null            # set when merged away
sources: [docs/0007-stripe-usage-billing.md#c12, docs/0011-hn-thread.md#c3]
hops: 3                      # inter-agent handoffs this cycle; hard cap 12
---

# Idea
One-paragraph pitch. Cited.

## Model
Customer, problem, offer, price, channel, unit economics incl. token COGS.

## Steps to realise
1. ...                       # planner-owned; required to graduate

## Comments                  # APPEND-ONLY. Never edit or delete prior entries.
### scorer — 2026-08-21T10:14Z
Rubric: 68/100. Weakest axis: inbound reachability...

### challenger — 2026-08-21T11:02Z
Prior art: Metronome/Lago serve this at the mid-market...
```

## Lifecycle: one bucket, one writer

The bucket directory is the write lock. Only the role listed below may edit `Idea` and
`Model` for a doc sitting in that bucket. Moves are `git mv`, so bucket and header
`status` always agree.

| bucket | who may edit body sections |
|---|---|
| `ideas-0-seeds/` | harvester, wanderer |
| `ideas-1-scored/` | scorer |
| `ideas-2-contested/` | challenger |
| `ideas-3-refined/` | refiner (planner co-owns `Steps to realise` only) |
| `ideas-4-ranked/` | ranker (header fields only — never the body) |
| `ideas-killed/` | nobody — retained, never edited |
| `ideas-archive/` | nobody — retained, never edited |
| `ideas-operator-rejected/` | overseer only — the operator's veto, any stage, `status: rejected` |
| `ideas-operator-selected/` | in place, by stage — see below |

`ideas-operator-selected/` holds ideas the operator has pinned for priority grooming.
Only the overseer moves a file in or out. Inside it, the normal stage cycle runs in
place: the `status:` field carries the stage and the `owner:` field is the write lock
that the bucket directory provides everywhere else. Every role treats a qualifying
operator-selected idea as outranking its ordinary queue — the scorer re-scores it when
its score is null or stale against the thread, the challenger contests it from
`status: scored`, the refiner works it at `status: contested` with a resolved
challenge, the planner maintains its steps, and the ranker includes it in `RANKED.md`
marked `pinned` and sets `status: ranked` when it meets graduation without moving the
file. The drafter treats a pinned, gate-clean, `status: ranked` idea exactly as if it
were in `ideas-4-ranked/`.

Operator rejections carry their reasoning as a final overseer comment, and
`ideas-operator-rejected/REASONS.md` distils each into a standing pattern. The
harvester and wanderer read that file before minting and do not seed an idea that
plainly matches a pattern; the scorer and challenger name a pattern match in their
comments and weigh the matching axes, never silently killing on it.

Any agent may append a comment to any idea in any bucket at any time. Comments are the
open conversation and the only thing every role can touch. A git-level conflict can only
happen if two roles violate bucket ownership, which makes a conflict a bug signal, never
an operational hazard.

## Split

When the refiner finds two distinct value propositions in one doc, it mints fresh child
ids suffixed `a`/`b` (`idea-0042a`, `idea-0042b`), each with `parent` set to the original
id. The parent moves to `ideas-archive/` with `status: split`. Both children re-enter at
`ideas-1-scored/` for independent scoring.

## Merge

The merger proposes a merge to the challenger's inbox when tag Jaccard is at least 0.6
and pitch-embedding cosine is at least 0.85, with a veto window of one challenger wake.
Left unvetoed, the merge executes: the surviving doc absorbs both comment histories under
provenance headers naming which doc each entry came from, and the absorbed doc moves to
`ideas-archive/` with `merged-into` set to the survivor's id.

## The digest rule

Once a `Comments` section passes roughly 20 entries or roughly 3,000 words, the refiner
writes a `### digest` comment summarising the thread so far. From then on, a wake reads
the digest plus everything after it, not the full history. Nothing is deleted — the
digest is a reading shortcut, not a replacement for the record.
