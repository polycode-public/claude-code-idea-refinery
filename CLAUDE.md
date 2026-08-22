# CLAUDE.md — refinery charter and maintainer rules

This file has two parts. The first is the refinery charter: every `claude -p` wake in this
repository reads it before doing anything else. The second is house rules for anyone
working on the machinery itself — a different audience, kept separate.

## Part 1 — the refinery charter

### What the refinery looks for

**EDIT BEFORE YOUR FIRST WAKE.** The standing brief below is a placeholder. It is the one
part of the charter that is yours to write. Replace it with two or three sentences saying
what kind of idea you want: who builds it, on what timescale, and what has to be true
about the money. Every wake of every agent reads this section, so a vague brief produces
vague ideas.

Keep the three gates that follow as they are, or rewrite them to fit your brief. A gate is
pass or fail. An idea failing one is dropped, whatever else it has going for it. Three
gates works well. With fewer the funnel fills with noise. With more, nothing gets through.

Standing brief (placeholder): *[the kind of product you want the refinery to find. Say who
builds it, how fast, and what has to be true about the economics. Signals over opinions:
every claim cited.]*

Three gates, all required — an idea failing any one of them is not refinery work:

1. **Captured demand.** Buyers are already searching: a mandate with a date, or a live
   pain being asked about now. Demand the refinery would have to create or teach fails
   the gate, however large the eventual market.
2. **A quarter to break even.** The Model's own cited numbers show a plausible path to
   revenue covering running costs within roughly a quarter. Structural blockers fail
   the gate: per-customer prices so small only volume saves them, sales cycles
   lengthened by education, value that waits on third parties adopting something first.
3. **Software-shaped delivery.** The deliverable is software one founder ships, with at
   most one bounded non-code component. A standing content treadmill, per-case human
   work, or a service posture as the core offer fails the gate.

### The horizon rule

> What was possible when a model was trained is a floor, not a map. Every claim about
> what is currently buildable, what it costs, what models and tooling can do, or who
> competes must be grounded in a dated, fetched source — memory of older projects is a
> hypothesis to test, never evidence. The absence of a current source is a gap to close
> (fetch it, or say the gap), not a licence to assume the old answer still holds. Known
> business patterns are priors to challenge, not templates: an idea is not weaker
> because no category name exists for it yet, and not stronger because it resembles
> something that worked years ago. Never write that something is impossible or out of
> reach into an idea document — state what evidence would change the assessment, and
> send the fetcher after it.

### Protocols

- `idea-doc` — the idea document format, who may edit what and where, and how ideas
  split and merge.
- `mail` — the mail block format, how to send and read it, and the hop limit.
- `rubric` — the seven scoring axes, the weights, and when an idea is killed or
  graduates.
- `citations` — what counts as a source and how to cite one.

### Overseer mail overrides everything

A directive from the overseer outranks every other instruction an agent reads on a
given wake. When a directive changes the course of an idea, log it as a comment on that
idea, so the reason is visible in the document itself and not only in mail.

### Refinery mail is `./mail/`, not the machine's

Machine-global session protocols — inter-session inboxes, cross-session memory — belong
to interactive Claude Code sessions on this machine. They do not apply to loop wakes.
A loop agent's mail is `./mail/` in this repository and nowhere else.

---

## Part 2 — house rules for maintaining the refinery

These bind anyone editing the machinery: the scripts, the prompts, the agent
definitions, the skills. The loop agents themselves work to Part 1.

## Pure script

The refinery is bash plus Node `.mjs` files invoked directly. A dependency earns its
place when it deletes more code than it adds in configuration and glue, on a path where
correctness is subtle. No frameworks, no build steps, no transpilation. Plain Node stays
plain. State lives in the filesystem and git, never in a process.

Two kinds of agent exist here, and they are not the same thing: the Claude Code
sub-agents you dispatch from an interactive session while working on the refinery, and
the refinery's own `claude -p` loop agents. These house rules bind the first kind. The
loop agents get their charter, protocols and skills from Part 1 and `.claude/`.

## The loops own the tree while they are awake

Once the refinery is running, its loop agents write to the `ideas-*` buckets, `mail/`,
`docs/`, `RANKED.md` and `THEMES.md`, and commit as they go. Don't edit those paths from
an interactive session while loops are live. Steer with overseer mail instead. For
anything bigger, `touch STOP` and wait for the loops to exit before you start.

## Check what your change can reach, in seconds, before it costs minutes

`npm run -s check` is the gate: `bash -n` on every shell script, `node --check` on every
`.mjs`, a JSON parse of `caps.json`, the bucket lint, and the test suite. Run what your
change can actually reach after every edit, and the full gate before you push.

## Always tee to a file before filtering — every pipe, not just the slow ones

Never pipe anything into `tail`, `head`, `grep` or any other filter without teeing it
first:

    cmd 2>&1 | tee /tmp/some-file.log | tail -20

The trigger is the pipe, not the duration. `tail` silently discards everything before
its window. `head` is worse: it SIGPIPEs the producer part-way through and the run
reports as clean. That matters doubly here, because loop logs (`logs/*.jsonl`) and long
loop output are exactly what a bare filter destroys. A command you have already seen run
long goes to the background, full stop.

## Name it, don't comment it

Prefer a self-documenting name over a comment that compensates for a vague one. When you
find a vague name propped up by an explaining comment, rename first, then drop the
comment. Comments exist only for a genuinely non-obvious WHY. Comments, test names and
prompt files must never reference a plan, a phase number, a commit hash or a date. That
framing belongs in the commit message, and it rots the moment the thing it points to
moves.

## Writing style

Plain English in every human-facing surface: docs, comments, idea documents, prompt
files, chat replies. Short sentences, active voice, everyday words. Cut the LLM-voice
tells: em-dashes as glue, "not X, it's Y" constructions, announced-honesty preambles,
colon reveals, hype, listicle bloat. This binds the prompt files too. Agents inherit the
register they are prompted in.
