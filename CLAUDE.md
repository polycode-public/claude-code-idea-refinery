# CLAUDE.md — refinery charter and build-session house rules

This file has two parts. Part 1 is the refinery charter. Every `claude -p` wake in this
repository reads it before doing anything else. Part 2 is house rules for the build
sessions that construct and maintain the refinery, a different audience kept separate.

## Part 1 — the refinery charter

### What the refinery looks for

Standing brief, amended by the operator 2026-08-22: bootstrappable software products a
solo technical founder could build and launch inside a few months and sell from day
one, with unit economics that survive their own token costs. Signals over opinions:
every claim cited.

Three gates, all required. An idea that fails any one of them is not refinery work:

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
> competes must be grounded in a dated, fetched source. Memory of older projects is a
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

Machine-global session protocols (inter-session inboxes, cross-session memory) belong
to interactive Claude Code sessions on this machine. They do not apply to loop wakes.
A loop agent's mail is `./mail/` in this repository and nowhere else.

---

## Part 2 — house rules for build sessions

## Project

`idea-refinery-poc` is a pure-script proof of concept for **The Idea Refinery**.
Independently looping `claude -p` sub-agents seed, score, challenge, refine, split, merge, tag,
and rank business ideas as markdown documents in a git repository. File-based mail coordinates
them, and a human overseer session supervises.

- `archive/idea-refinery-poc.md` is the source design and
  `archive/PLAN_IDEA_REFINERY.md` the delivered plan of record refined from it. Where
  the two disagree, the plan wins and says why. Delivered docs live in `archive/`.
- `NEXT.md` is the living handover, and any session resumes from there. It holds open
  items only. Completed work is deleted, not narrated; `git log` holds that record. When a
  phase closes, mark it in its plan doc and delete its `NEXT.md` line **in the same
  commit as the work**. Session handle (inbox): `refinery`.
- **Pure script** means bash plus Node `.mjs` invoked directly. A dependency earns its place
  when it deletes more code than it adds in configuration and glue, on a path where correctness
  is subtle. No frameworks, no build steps, no transpilation. Plain Node stays plain. State
  lives in the filesystem and git, never in a process.
- Two kinds of agent will exist here, and the difference matters: Claude Code sub-agents
  you dispatch while *building* the PoC, and the refinery's `claude -p` loop agents that *are* the
  PoC. House rules in this file bind the build sessions. The loop agents get their charter,
  protocols, and skills as designed in the source doc.
- Remote: `gitlab.com/polycode-playground/idea-refinery-poc`. Commit with the repo-local
  identity (`antony@polycode.co.uk` / `Antony Cartwright`), one commit per completed step,
  conventional messages.

## An approved plan is the authorisation — never stop to ask if you should continue

If the operator approved a plan, or the prompt says "complete X", work it to the end and do not
ask permission to keep going. A green check, a clean commit, or a tidy summary is a checkpoint,
not a decision point. The pull to stop is strongest exactly when a chunk completes well. Only
three things stop the work: a hard safety rule, a genuine blocker with no next action left
anywhere in the plan, or the operator saying stop. Ask only what the plan genuinely does not
decide, and ask it *before* the work, not as a way to pause in the middle.

**The companion rule: write status as you go, not at the end.** When a phase closes, mark it in
its plan doc and delete its `NEXT.md` line in the same commit as the work. Status written at the
end is status never written.

## Explicit versioning/commit/push instructions are not up for debate

If the operator's prompt states when to commit or push (e.g. "commit and push each turn"),
execute it exactly as stated. It overrides any general policy written here or anywhere else in
this repo; don't ask clarifying questions about cadence. Only stop if following it would violate
a hard safety rule (e.g. leaking a secret).

## Working model

Keep the chat for chat: anything long-running (a refinery soak, a multi-file sweep, an index
build) executes as a background task. The main session launches it, keeps coordinating, and
collects results on the completion notification. When dispatching sub-agents, give each clear
file-ownership boundaries and pick the lowest model tier that meets the task's needs. The
ladder runs Fable to Opus to Sonnet to Haiku. Before merging a sub-agent's worktree, check
`git status --short` inside it, not just its last commit. Untracked work vanishes with the
worktree.

Once the refinery runs, its loop agents own the tree while they're awake. Don't edit the ideas-* buckets or
`mail/` from a build session while loops are live; use the overseer's mail protocol from the
design instead, and `touch STOP` to halt the loops before surgery.

## Check what your change can reach, in seconds, before it costs minutes

There is no test suite yet; the plan decides what one looks like. Until then the gate for any
touched script is cheap and immediate: `bash -n` on shell, `node --check` on `.mjs`, a JSON/YAML
parse on config, and one real invocation of whatever you changed (a single wake of a loop, one
`retrieve.mjs` query). When a suite exists, the same principle holds: run what the change can
actually reach after every edit, and save the full sweep for the moment the work becomes someone
else's problem, a push to `main`.

## Always tee to a file before filtering — every pipe, not just the slow ones

Never pipe anything into `tail`, `head`, `grep` or any other filter without teeing it first:

    cmd 2>&1 | tee /tmp/some-file.log | tail -20

The trigger is the pipe, not the duration. `tail` silently discards everything before its window.
`head` is worse, because it SIGPIPEs the producer part-way through and the run reports as
clean. This matters doubly here: loop logs (`logs/*.jsonl`) and long loop output are exactly
the kind of thing a bare filter destroys. And a command you have already seen run long goes to the
background, full stop.

## Name it, don't comment it

Prefer a self-documenting name over a comment that compensates for a vague one. When you find a
vague name propped up by an explaining comment, rename first, then drop the comment. Comments
exist only for a genuinely non-obvious WHY. Comments, test names, and prompt files must never
reference a plan doc item, a phase number, a commit hash, an operator directive, or a date.
That framing belongs in the commit message, and it rots the moment the doc it points to moves.

## No decision residue in live docs

Live docs serve open items only. Settled decisions are recorded nowhere but the commit message.
The test for any flag, caveat, status line, or footnote, in a reply or a committed doc: could
the operator act differently because of this sentence, on work that actually exists? If not,
delete it.

## Don't narrow scope on your own judgment

When investigating one reported bug turns up a second, adjacent one, fold it into the current
fix by default. Only treat something as separate work when it's genuinely a separate, large body
of work, and say so explicitly so the operator can object rather than making that call silently.

## Never write capability walls — state the horizon, not the wall

Same rule as the global `~/.claude/CLAUDE.md` ("Never document capability walls"). Read it
there for the full reasoning. What the design defers (real concurrency, Slack UX, cloud IAM,
Gate 2 experimentation) is sequencing for later phases, not impossibility. Write it that way.

## Writing style

Plain English in every human-facing surface: docs, comments, idea documents, prompt files, chat
replies. Short sentences, active voice, everyday words. Cut the LLM-voice tells: em-dashes as
glue, "not X, it's Y" constructions, announced-honesty preambles, colon reveals, hype, listicle
bloat. This binds the refinery's prompt files too. Agents inherit the register they're prompted
in. The `plain-prose` skill is the full guide. Load it before writing any human-facing text.

## Operator skills

- `npm run -s cycle -- [-n max_cycles] [agent ...]` — one wait-less serial pass through the funnel.
- `/refinery-run [up|status|down] [cruise]` — start, inspect, or stop the continuous refinery.
- `/refinery-cycle [-n N] [agents...]` — run the cycle command and summarise what moved.
- `/idea-inject <prose or idea-NNNN>` — put one idea through the whole funnel, from operator
  prose or from wherever an existing idea currently stands.
- `/idea-digest` — write `digests/DIGEST_<date>.md`, the standing snapshot of every idea.
- `/refinery-viz` — start the local viewer and hand back its URL: the funnel board,
  the sub-agent rail and the pulse, live off the filesystem, read-only.

These are operator-session tools, not refinery wake prompts. No `claude -p` loop invokes them.
README.md holds the full run-book.
