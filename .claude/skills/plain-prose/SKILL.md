---
name: plain-prose
description: The repo's writing rules for plain, human prose and the LLM-voice tells to cut. Load it before writing any human-facing text — docs, code comments, wake prompts, skill docs, viz UI copy, or chat replies.
---

# plain-prose — write plain, human prose

The stock LLM writing voice reads as generic and machine-made. This refinery is built
from prompts, and agents inherit the register they are prompted in, so the voice of
every prompt file and doc propagates into every idea document the loops write. This
skill is the standing style guide. Its job is to make prose read as if a person wrote
it, and to keep reader-facing surfaces short enough that someone actually reads them.

**Scope: everything written for a human reader by a person or a build session.**
`README.md`, `CLAUDE.md`, `NEXT.md`, the `archive/` design docs, every skill doc, the
agent definitions in `.claude/agents/`, the wake prompts in `prompts/`, code comments
in `scripts/`, `src/`, `test/` and `e2e/`, every string the viz page shows a reader,
and chat replies.

**Out of sweep scope: the refinery's data.** Idea documents in the `ideas-*` buckets,
fetched sources in `docs/`, `mail/`, `digests/`, `plans/`, `RANKED.md` and `THEMES.md`
are the corpus and the loops' output. Never rewrite them for style. The way to improve
their prose is to improve the prompts that produce them.

The base rules in section 1 are the Plain English Campaign's, who have promoted plain
English and fought gobbledygook since 1979 (plainenglish.co.uk). Section 2 adds the
LLM-voice tells to cut on top of them.

---

## 1. Plain English base rules

The foundation. Apply these before worrying about anything else.

- **Short sentences. Average 15–20 words.** Mix short and longer, but if a sentence
  runs past ~25 words, split it.
- **One idea per sentence** (plus perhaps one closely related point). Two ideas joined
  by a dash or semicolon usually want to be two sentences.
- **Active voice, not passive.** "The scorer moves the idea," not "the idea is moved
  by the scorer." Passive hides who does what and adds words.
- **Everyday words.** Use the simplest word that fits. Cut jargon a first-time reader
  can't parse, or define it in three words the first time.
- **Write to the reader as "you"; call ourselves "we".** "You run it from the repo
  root," not "the tool is run by the user from the repo root."
- **Cut nominalisations** (an abstract noun hiding a verb). "It fails," not "it
  results in a failure."
- **Use lists** when you have three or more parallel points. A bullet list scans; a
  comma-spliced sentence does not.
- **Cut every word that earns nothing.** Delete redundant openers ("It is important
  to note that", "In order to"), doubled words ("each and every"), and filler adverbs.

Common substitutions (Plain English Campaign's A-to-Z, the ones that recur):

| instead of | write |
| --- | --- |
| additional | extra |
| commence / initiate | start |
| ensure | make sure |
| in excess of | more than |
| prior to | before |
| subsequent to | after |
| terminate | end |
| utilise | use |
| in order to | to |
| approximately | about |
| demonstrate | show |
| sufficient | enough |
| require | need |
| regarding / with regard to | about |
| whilst | while |
| in the event that | if |

---

## 2. The LLM-voice tells to cut

On top of the Plain English rules, scan every draft for these machine-voice
fingerprints and remove them.

- **Em-dash sprinkling as fake sophistication.** Do not bolt clauses together with
  `—`. Use a period, a comma, or restructure. Reserve em-dashes for rare, deliberate
  use.
- **The "not X, it's Y" / "not X but Y" / "not only X but also Y" negation-contrast.**
  State what the thing is, not what it isn't.
- **Announced-honesty preambles.** Drop "honest current state:", "to be clear,"
  "reported honestly." Just report the thing. Labelling text as honest signals the
  opposite.
- **Colon reveals.** Avoid the dramatic setup-then-colon. Write a plain subject-verb
  sentence.
- **Anthropomorphizing tools.** A script does not "want," a lint does not "complain."
  Say what it did. (Naming the loop agents by role — the harvester seeds, the
  challenger presses — is the repo's working vocabulary, and stays.)
- **Rule-of-three padding, hedging, and hype.** Cut "powerful", "transformative",
  "seamless", "robust", "in the ever-evolving landscape", "it's worth noting",
  "delve", and the reflexive three-item list where one item does the job.
- **Listicle bloat and promotional filler.** Don't inflate two real points into a
  bulleted five. Don't restate the headline three ways. One concrete claim beats
  three decorated ones.

Default to short declarative sentences a person would write. Say the thing once,
plainly.

---

## 3. The shop window and the back room

Reader-facing surfaces sell the idea; they are not the place to prove it. Here the
shop window is `README.md` and the viz page. The back room is `archive/` for design
detail, `npm run -s report` for measurement, and `git log` for the record.

- Lead with what the reader gets, then how to try it, then a short claim with a
  pointer. If method arrives before benefit, move it.
- One small table at most on a reader-facing surface, and only if it earns its place.
- State conditions in one clause, not three hedged paragraphs.
- On the viz page, every visible string is UI copy: labels short, states honest
  ("down" when down, "empty" when empty), no filler sentences where a word does.

The rule in one line: the claim lives in the window, the proof lives in the back
room, and a pointer connects them.

---

## 4. Related principles (same spirit)

- **No delta-framing.** Describe the work on its own terms, never as a rebuttal to
  something else. Contrast framing reads as defensive.
- **Dependency pragmatism.** Never frame work around avoiding dependencies. State
  what a choice does positively.
- **Negative-scope statements stay factual.** A "what this is not" bullet is fine
  when it states a positive scope decision (the viewer reads, changes happen in
  Claude Code). Don't let one drift into a quarrel.

---

## 5. Workflow — edit before you ship

Delegate the drafting of a large deliverable to a background sub-agent under the
coordinator model (`CLAUDE.md`), then review and edit the result in the main session.

After drafting any human-facing text:

1. **Cut length first.** Split every sentence over ~25 words. Delete redundant
   openers and filler. Run the substitution table over it.
2. **Cut the tells.** Search for `—`, "not just", "not only", "not X, it's Y",
   honesty self-labels, "delve", "it's worth noting", and hype adjectives.
3. **Read it as a stranger.** If a clause sounds like a press release or a model's
   default voice, rewrite it as the sentence a person would say out loud.
4. **Match the surrounding voice.** These docs are terse and plain. A paragraph that
   suddenly turns formal and three-adjectived is a tell even if every word is fine.
5. **In prompts, check the inheritance.** A wake prompt's register becomes the
   agents' register. If a prompt hypes, the idea documents will hype.

This applies to chat replies too, not only the artefacts.

---

## 6. One-paragraph TL;DR

Write plain, direct prose a person would recognise as human. Short sentences (15–20
words), one idea each, active voice, everyday words, "you"/"we", no nominalisations,
lists for parallel points. Cut the LLM tells: em-dash sprinkling, "not X it's Y",
announced-honesty, colon reveals, anthropomorphized tools, hype, rule-of-three
padding, listicle bloat. On the README and the viz page, lead with the benefit and
point to the proof in `archive/`, `npm run -s report` or `git log` instead of
reproducing it. Never style-sweep the corpus (`ideas-*`, `docs/`, `mail/`,
`digests/`, `plans/`, `RANKED.md`, `THEMES.md`); fix the prompts instead. Base rules
are the Plain English Campaign's (plainenglish.co.uk).
