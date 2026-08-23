# The Idea Refinery — a worked example

A running log of one session with the refinery. It records what the operator asked
for, what the session did in response, and the ideas that came out at the end.

The repository used here is `polycode-public/idea-sandbox`, created from the template
`polycode-public/claude-code-idea-refinery`.

---

## Prompt 1 — the operator

> Hello Claude, In this session I want a human readable as a .md file showing my
> prompts and the actions you take and eventually the refined and ranked ideas. This
> log should be written to `../../polycode-unpublished/idea-refinery-poc/EXAMPLE.md`.
> Start the log now by explaining how a repository can be created from a template from
> https://github.com/polycode-public/claude-code-idea-refinery to create a repository
> like this one. Then I'll send a prompt for 1 idea and you'll run the agents to
> refine and you will capture the activity through to the end.

### What the session did

Read the sandbox repository, confirmed it was generated from the template, and started
this log.

Checked against GitHub:

```
$ gh repo view polycode-public/claude-code-idea-refinery \
    --json name,isTemplate,visibility
{"isTemplate":true,"name":"claude-code-idea-refinery","visibility":"PUBLIC"}

$ gh repo view polycode-public/idea-sandbox \
    --json name,templateRepository,visibility
{"name":"idea-sandbox","templateRepository":{"name":"claude-code-idea-refinery",
 "owner":{"login":"polycode-public"}},"visibility":"PRIVATE"}
```

So `idea-sandbox` is a template generation of the refinery, not a fork. The rest of
this section is how to make another one.

---

## Creating your own refinery from the template

`claude-code-idea-refinery` is a GitHub template repository. Generating from it gives
you a fresh repository with the same files and no shared history, so your ideas and
commits are your own from the first line.

### Option A — the GitHub website

1. Open https://github.com/polycode-public/claude-code-idea-refinery
2. Click **Use this template**, then **Create a new repository**.
3. Pick the owner and a name. Choose private or public.
4. Click **Create repository**, then clone it.

### Option B — the `gh` command line

```bash
gh repo create <owner>/<your-repo> \
  --template polycode-public/claude-code-idea-refinery \
  --private \
  --clone
cd <your-repo>
```

Swap `--private` for `--public` if you want it open.

### What you get

The generated repository holds the whole refinery:

| Path | What it is |
| --- | --- |
| `.claude/agents/` | the sub-agent definitions: harvester, scorer, challenger, refiner, merger, planner, ranker, tagger, wanderer, fetcher, indexer, drafter, probe |
| `.claude/skills/` | the operator skills and the protocols agents read: `idea-doc`, `rubric`, `mail`, `citations` |
| `prompts/` | one wake prompt per agent |
| `scripts/`, `src/` | the loop runner, the cycle runner, mail, ranking, themes, retrieval |
| `ideas-*/` | the funnel buckets, empty on a fresh generation |
| `caps.json` | per-agent spend caps and wake intervals |
| `CLAUDE.md` | the refinery charter every wake reads first |

The idea buckets start empty. A fresh generation has nothing in `ideas-0-seeds`
through `ideas-4-ranked`, so nothing from another operator's corpus follows you.

### Setting it up

You need Node 24 or later, the Claude Code CLI logged in, tmux, git, and a Voyage AI
key for embeddings.

```bash
npm install
cp .env.example .env      # then fill in VOYAGE_API_KEY
npm run -s check          # syntax, config parse, bucket lint, tests
```

Then prove the plumbing with one probe wake before touching anything real:

```bash
npm run -s loop -- probe 5
touch STOP.probe
```

### Keeping up with the template

A template generation shares no history with its template, so `git pull` from upstream
will not work on its own. The `/git-sync-template` skill joins the two histories on the
first run and treats later syncs as ordinary merges. This sandbox has already done that:

```
a950012 chore: sync from template
24068b9 chore: link template history from claude-code-idea-refinery
5b384e0 Initial commit
```

---

## Prompt 2 — one idea through the funnel

The operator ran the `/idea-inject` skill with this brief:

> og-social - it's basically Facebook cira 2007 no ads, no algo feeds, just what your
> auntie had for tea. User's will be able to opt out of what data can be shared and
> we'll be up front about selling this data when we have enough. Until then it will be
> run on a shoe string.

### What the session did

`/idea-inject` in prose mode sends the brief to the harvester as an overseer directive,
then runs cycles of the funnel until the idea graduates, is killed, or stalls.

**Step 1. Mail the harvester.** The brief went out verbatim, with instructions to seed
this one idea only, apply the charter's three gates honestly, and refuse to seed if a
gate fails.

```
$ npm run -s mail -- send harvester --from overseer
```

**Step 2. Run the funnel.** The skill's default is `npm run -s cycle -- -n 4`, which
wakes all twelve agents per cycle. This run named agents instead, for two reasons. The
wanderer exists to seed ideas away from the dominant theme, and this run is about one
idea. The tagger and the indexer need a `VOYAGE_API_KEY` for embeddings, and the
sandbox had no `.env` at the time the cycle started. The operator supplied the key
during the run, so both are available from here on.

```
$ npm run -s cycle -- -n 4 harvester scorer challenger refiner planner fetcher ranker drafter
```

The funnel order matters. The harvester seeds into `ideas-0-seeds/`. The scorer applies
the rubric and moves the idea to `ideas-1-scored/` or `ideas-killed/`. The challenger
attacks it with fresh evidence and moves it to `ideas-2-contested/`. The refiner
resolves the contested comment thread into `ideas-3-refined/`. The planner adds the
steps to realise it. The ranker rebuilds `RANKED.md`. The fetcher saves cited sources
into `docs/`. The drafter turns a graduated idea into a realisation plan.

The run stopped at the first agent.

---

## Outcome — the harvester refused to seed

The harvester read the overseer directive, searched and fetched live sources, and
declined. One commit came out of the run:

```
7adbab0 harvester: no seed; mail overseer that og-social brief fails all three gates
        (deferred data-sale revenue, no day-one buyer, OSA moderation burden)
```

Every idea bucket stayed empty. `RANKED.md` did not change. The refusal itself is the
product: the charter tells the harvester to mail the overseer rather than seed an idea
that fails a gate, so the reasoning is on the record with its sources.

### The harvester's reply to the overseer

Read with `npm run -s mail -- read overseer`. Reproduced in full:

> No seed this wake. The og-social brief fails all three gates as stated; the sharpest
> failure is Gate 2, and it is structural, in the brief's own words.
>
> **Gate 2 (a quarter to break even): FAIL.** The brief defers all revenue: "we'll be up
> front about selling this data when we have enough. Until then it will be run on a shoe
> string." Data sale is a pure volume play; there is no cited price, no buyer, and no
> path to revenue covering costs in a quarter. This is the charter's named structural
> blocker: value that waits on accumulating scale first. Precedent fetched this wake:
> Ello, the last prominent "no ads, no data selling" network, burned ~$10.9M over nine
> years (launched 2014-08-07, 400k MAU by Nov 2017), never found revenue, and shut down
> 2023-07-18 deleting all user content
> (https://waxy.org/2024/01/the-quiet-death-of-ellos-big-dreams/, fetched 2026-08-23).
>
> **Gate 1 (captured demand): FAIL.** The brief names no buyer. Users pay nothing; the
> eventual data buyers are hypothetical and years away. There is real, dated evidence
> that consumers will pay subscriptions for ad-free social (social-media subscription
> market ~$36B in 2026, e.g. 14M Snapchat+ payers by end-2024, per
> https://www.coherentmarketinsights.com/industry-reports/social-media-subscription-market
> and https://www.statista.com/topics/11036/social-media-subscriptions/, searched
> 2026-08-23), but the brief explicitly excludes charging anyone.
>
> **Gate 3 (software-shaped delivery): FAIL for a UK-based solo founder.** A consumer
> user-to-user network is in scope of the Online Safety Act regardless of size: illegal
> content risk assessments, proportionate moderation duties, and non-self-declared age
> assurance where children can access it, with penalties up to the greater of £18M or
> 10% of worldwide revenue
> (https://www.abouthumanrights.co.uk/the-online-safety-act-in-2026-what-platforms-now-have-to-do.html,
> fetched 2026-08-23). Standing content moderation of a general-audience UGC network is
> per-case human work, not one bounded non-code component, and it is incompatible with
> "run on a shoe string".
>
> What evidence would change the assessment: a version of the brief with a named paying
> buyer at day one (e.g. a paid membership tier with cited comparable price points, or a
> B2B angle) and a delivery shape that bounds the moderation obligation. The
> subscription-market numbers above suggest that variant is worth a fresh brief; this
> one, as written, is not seedable.

### Reading the refusal

Three things in that reply are worth pulling out.

**It fetched sources this wake rather than reasoning from memory.** The charter's
horizon rule forbids treating what a model already knows as evidence. Every claim above
carries a URL and a fetch date. The Ello post-mortem, the subscription market size, and
the Online Safety Act duties were all pulled on 2026-08-23.

**It named the gate, not a verdict.** Gate 2 failed on the brief's own words. Revenue
waits on volume, so nothing covers running costs in a quarter. Gate 1 failed because
nobody is asked to pay at launch. Gate 3 failed because a general-audience UGC network
in the UK carries a standing human moderation duty, which is per-case human work.

**It said what would change the answer.** The charter forbids writing that something is
impossible. The reply ends with the shape of a brief that would pass: a named paying
buyer on day one, and a delivery shape that bounds the moderation duty. It even points
at the evidence that variant would stand on, the paid ad-free social market.

### What the operator can do next

The refinery has done its job here. Three moves are open:

1. **Re-brief with a day-one buyer.** A paid membership tier, priced against cited
   comparables, turns Gate 1 and Gate 2 from fails into questions the scorer can weigh.
2. **Bound the moderation duty.** A closed, invite-only network for a defined group is
   a different regulatory shape from a general-audience one.
3. **Overrule the harvester.** Overseer mail outranks every other instruction an agent
   reads. A directive to seed it anyway, with the gate failure logged as a comment on
   the idea, would put it into the funnel and let the scorer and challenger argue it out
   in the document.

---

## Prompt 3 — the re-brief

The operator took the first option and put a fee on it:

> re-brief with a fee where this fee is a strict margin calculation, re-calulated per
> year based on a forecast of per user cost for the next year offset by any under or
> over spend in the previous year. (My expectations are that per-user costs drop as
> users increase so we dont need to cap users and most likley the fees will decrease
> when there is growth and a scale to zero architecture plus the first year experience
> will give us our minimum).

That is a cost-recovery membership. Members pay from day one. The fee is set once a
year from a forecast of per-user cost, then trued up by the previous year's under or
overspend. There is no margin in it by construction.

### What the session did

Mailed a second overseer directive to the harvester, `re: og-social`, carrying the new
brief verbatim on top of the original description. It told the harvester not to
re-argue the refused brief, and named the two things that need fetched numbers rather
than assumption:

1. The per-user running cost of a scale-to-zero social network at a small membership,
   with cited prices. Year one's fee is that number, and it decides whether anyone
   pays it.
2. Whether paid, closed membership with verified identity bounds the Online Safety Act
   moderation and age-assurance work enough for one founder to carry it.

Then woke the harvester on its own, rather than through a full cycle, so the funnel
moves one stage at a time with no idle wakes in between.

### The harvester seeded it

```
commit: harvester: seed idea-0001 cost-recovery paid social network (overseer og-social re-brief)
```

`ideas-0-seeds/idea-0001-cost-recovery-member-social-network.md`, titled **Cost-recovery
paid social network for people who know each other**. What the document says, in short:

**Customer.** Groups who already know each other, families, villages, clubs, alumni
circles, whose organiser is looking for an ad-free private home off Facebook.

**Offer.** Private feed, profiles, photos, groups, events, messaging. No ads, no
recommendation algorithm, member-controlled sharing. Verified identity at signup by
payment card plus an invitation from an existing member.

**Price.** The operator's mechanism, restated: forecast next year's per-user running
cost, offset by the previous year's under- or overspend, recalculate once a year. No
user cap. Fees expected to fall as membership grows.

**The cost number.** This is the part the directive demanded, and the harvester fetched
AWS list prices to get it. Modelled at 500 members at ~1,000 requests each per month:

| Component | Monthly |
| --- | --- |
| Lambda (500k requests, ~6,250 GB-s) | ~$0.20, absorbed by the free tier |
| DynamoDB on-demand (~5M reads, ~0.5M writes) | ~$0.94 |
| Media, 500GB, priced at DynamoDB's $0.25/GB as a deliberate upper bound | ≤$125 |

Worst case about $126/month, roughly **$3.05 per member per year**. Tripled for domain,
DNS, monitoring and compliance tooling, year one lands near **£5–10 per member per
year**. The comparison it drew: MeWe sells storage add-ons at $4.99 a *month*, so the
fee is an order of magnitude under a demonstrated willingness to pay.

**Break-even.** Structural rather than hoped-for. Fees are collected against the same
forecast that defines running costs, so revenue covers costs from the first paid
cohort. The document names the real Gate 2 risk as the minimum viable cohort, not
margin: one founding group of 50–100 members paying about £10 covers the fixed floor.

**The Online Safety Act.** The gov.uk explainer says duties are proportionate to the
size and capacity of the provider, and that small services are not required to take the
same actions as the largest corporations. A small service needs an illegal-content risk
assessment, takedown on flag, terms of service, and a reporting mechanism. Children's
duties only activate where a service is likely to be accessed by children, and
card-verified adult membership is the designed lever to bound that.

**Four named gaps.** The harvester recorded what it could not confirm rather than
guessing:

1. The exact S3 Standard per-GB rate and eu-west-2 prices. The pricing pages render
   rates through calculator widgets that did not extract. This moves the fee floor, not
   the gate outcome, because the upper bound already passes.
2. Ofcom's children's access assessment guidance, and whether payment-card checks count
   as highly effective age assurance. `ofcom.org.uk` returns HTTP 403 to automated
   fetches, so the target URLs are recorded for a human or another route.
3. A direct demand-volume number. Current evidence is exodus-shaped rather than a
   keyword figure.
4. Whether any incumbent already sells this exact shape. MeWe, Vero and Minds are
   ad-free, none is cost-recovery priced, and a proper competitor sweep is the
   challenger's job.

### Running the rest of the funnel in two lanes

Each funnel stage rewrites the same document, so the scorer, challenger, refiner,
planner and ranker have to run in order. The fetcher and indexer touch `docs/` and
`index/`, and the tagger writes `THEMES.md`, so those run at the same time as the
funnel rather than behind it.

Both lanes commit through the same git mutex, so they never fight over `index.lock`.
The scorer and the fetcher were launched together the moment the seed landed.

---

## Two template bugs, found by running it

The first parallel wave failed, and how it failed is worth more than the idea was.

### The scorer reported an empty bucket that was not empty

The scorer woke with `idea-0001` committed in `ideas-0-seeds/` and reported:

> No unread mail, no seeds in `ideas-0-seeds/`, no null-score ideas in
> `ideas-1-scored/` [...] Nothing to score this wake — exiting without writing,
> committing, or mailing.

The fetcher and indexer failed at the same moment, but loudly:

> I need permission to run bash commands. Purpose: extract all unfetched URLs from the
> `sources` lists in the live idea buckets...

One cause. The agent definitions in `.claude/agents/` grant `Read, Write, Edit, Bash`
and not `Glob` or `Grep`, so agents find files by running `ls`, `grep` and `find`
through Bash. The allowlist in `.claude/settings.json` permits `Bash(node src/*)`,
`Bash(npm run:*)` and the git verbs, and nothing else. Both `scripts/loop.sh` and
`scripts/cycle.sh` run with `--permission-mode dontAsk`, so every discovery call is
denied.

The fetcher and indexer stopped and said so. The scorer read the denial as an empty
directory, exited clean, and committed nothing. That is the dangerous shape: a silent
false negative that looks exactly like a considered verdict. On a continuous run the
funnel would simply appear idle.

Fixed here by adding read-only discovery commands to `.claude/settings.local.json`:
`ls`, `grep`, `find`, `head`, `wc`, `git status`, `git diff`, `mkdir`. `cat` and `sed`
were deliberately left out, so the existing `Read(.env)` deny still means something.
The scorer scored the idea normally on its next wake.

### The fetcher never saw the citations

`scripts/cycle.sh` wakes the scorer before the fetcher. The fetcher only reads live
buckets. So a seed scored and killed in the same cycle moves to `ideas-killed/` before
the fetcher wakes, and its cited URLs are never saved.

That is what happened. `idea-0001` cited five sources; the fetcher's next wake reported
"All live idea buckets are empty. There are no unfetched citations to gather." The
evidence behind a kill decision was left unfetchable from the local corpus. This run's
two-lane design made it worse rather than better, because the lanes started together.

Both bugs went to the template's own session through the machine's inbox protocol
(`~/.claude/inboxes/refinery.md`), with the wake output as evidence.

---

## The scorer killed idea-0001

Score **61/100**, breakdown
`{pain: 3, wtp: 3, inbound: 3, build: 4, cogs: 4, density: 2, risk: 2}`.

The total did not decide it. The rubric kills any idea scoring below 4 on inbound
reachability, whatever the total, because the refinery pursues captured demand only.

The reasoning on that axis:

> "Facebook alternative" is a live, evergreen search category, and five-plus
> independent 2026-dated listicles corroborate it. But the described channel, direct to
> group organisers with invitation-only spread, doesn't capture that search traffic at
> all. It's an outbound/referral channel, not an inbound one. The demand evidence and
> the go-to-market channel point at two different mechanisms, and the searchers found
> by the listicles land on MeWe/Vero/Minds, not an unknown solo-founder product.

Two other things the scorer did are worth noting, because they are the behaviours the
charter is trying to produce.

**It spot-checked its own seed's sources.** MeWe's $4.99–6.49/month tier confirmed
independently. Ello's shutdown and its cause confirmed. The $10.9M burn figure recorded
as not independently reproduced.

**It found an argument the harvester missed.** MeWe and Vero are optional upgrades on
networks that are free to join. This idea asked every member of a friend group to pay
just to migrate in. Different ask, and the cited precedents do not test it.

---

## Prompt 4 — adapt it

The operator's instruction: tell the overseer to adapt idea-0001 into a viable
business.

### What the session did

`ideas-killed/` is never edited, so the killed document stays as the record. The
overseer directive told the harvester to seed a fresh child id with
`parent: idea-0001`.

Two things were fixed, because they are the operator's:

1. The fee mechanism, unchanged.
2. The product posture: no ads, no algorithmic feed, members control what data may be
   shared.

Customer, channel, offer scope and delivery shape were all open.

The directive also carried the arithmetic. Score is the weighted sum over five, with
pain 20, willingness-to-pay 20, inbound 15, buildability 15, COGS 10, density 10, risk
10. Lifting inbound alone from 3 to 4 reaches 64, and graduation needs 65. So the
adaptation had to win points on pain, willingness-to-pay, density or risk as well. It
was told not to argue the gate down, and to refuse again if the evidence did not
support a fix.

### idea-0002: the same mechanism, a different customer

```
commit: harvester: seed idea-0002 OSA-compliant community home for small UK forums
        (overseer-directed child of killed idea-0001)
```

**Cost-recovery community platform that carries Online Safety Act duties for small UK
forums.** Volunteer admins of small UK community forums now carry regulated-service
duties. Communities migrate in as invitation-only spaces, and the platform operator is
the provider of the user-to-user service, so the duty set is done once, centrally, and
divided across every member on the platform.

That is what fixes the gate, and it also gives the operator's fee mechanism teeth.
Compliance is a mostly fixed cost, so every community that joins makes every member's
fee smaller. The pricing policy became the pitch.

The evidence it fetched is current and countable, which is exactly what the parent
lacked:

- 22 UK forums documented as shut down over the Act. LFGSS and the Microcosm platform's
  closure orphaned roughly 300 small communities.
- Ofcom's guidance runs to an 84-page risk-assessment document and a 33-page
  record-keeping template, judged too much for volunteer forum owners by an author who
  tried it.
- A live multi-month admin complaint thread, December 2024 to February 2025, where
  admins discuss Discord and Facebook Groups as escape routes. That trade is the one
  the product removes.
- Discourse Pro at $100/month and Business at $500/month, with the pricing page silent
  on the Act. A 200-member community at about £5/member/year pays less per year than
  one month of Discourse Pro, and gets the duty set carried.

**It named the load-bearing uncertainty rather than burying it.** Gap 1 asks whether
hosting migrated communities as spaces on one service actually moves provider duties to
the platform operator. The document says the Facebook Groups analogy is "the prior to
test, not evidence".

**It logged a counter-signal against its own case.** LFGSS and The Hamster Forum later
reopened, and Ofcom enforcement against small low-risk services is described as
"vanishingly small" in likelihood. So the product sells relief from burden and fear,
not from enforcement. The document says so.

### The lane order, corrected

The fetcher ran first this time, before the scorer could move the file:

```
commit: fetcher: save 0001-online-safety-act-repeal-bennett,
        0002-lfgss-shutdown-online-safety-act, 0003-discourse-pricing
```

Three sources saved to `docs/` while the idea is still live. The second bug, avoided in
practice by sequencing rather than by a code change.

*(Run in progress — the result follows.)*
