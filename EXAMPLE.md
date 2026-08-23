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

### A third bug: the indexer cannot run its own command

`prompts/indexer.md` tells the indexer to run:

```
npm run -s indexer -- --new-only > /tmp/indexer-wake.log 2>&1
echo "exit: $?"
tail -20 /tmp/indexer-wake.log
```

The prompt explains the redirect. It avoids `| tail` so a pipe cannot mask the
pipeline's real exit code. Sound reasoning, and the redirect stops the command matching
`Bash(npm run:*)` in the repo's own allowlist. The template's prompt issues a command
the template's settings deny.

Allowing the exact literal did not clear it either, so the block comes from the shape of
the command rather than the program name. Run by hand the pipeline works first time:
3 docs and 2 ideas scanned, 25 chunks indexed. On an unattended generation `index/`
would stay empty forever, with no error anywhere except a wake result nothing reads.

---

## The scorer kept idea-0002

Score **68/100**, breakdown
`{pain: 4, wtp: 2, inbound: 4, build: 4, cogs: 4, density: 4, risk: 2}`.

Both gates clear. The adaptation moved exactly the axes the directive aimed at: inbound
3 to 4, density 2 to 4, pain 3 to 4.

The scorer searched rather than trusting the seed. It confirmed the scope claim from two
sources the harvester never cited, and ran two competitor searches of its own. Four
independent searches now find no turnkey competitor, and it still refused to call the
space cleared while gap 6 stays open.

Two axes stayed at 2, and it said why in plain terms:

- **Willingness-to-pay.** Discourse's $100–500/month anchors what forums pay for hosting
  software, not for compliance. No forum is shown paying a third party for compliance
  relief. "The ask is inferred from pricing precedent, not observed."
- **Risk.** Gap 1 again. The scorer searched Ofcom and legislation.gov.uk itself and
  found "nothing confirming the Facebook-Groups analogy the whole value proposition
  rests on."

68 clears the kill floor and falls short of graduation, which needs 65 plus a resolved
challenge plus real steps.

---

## The challenger

This is the wake that shows what the funnel is for. It fetched the statute, the repeal
petition's government response, an implementation guide, a Forumotion staff thread and a
summary of Ofcom's age-assurance guidance.

**It conceded gap 1, the load-bearing question, on the statute's own words.** OSA
s.226(2) says the provider of a user-to-user service "is to be treated as being the
entity that has control over who can use the user-to-user part of the service (and that
entity alone)". A platform operator controlling all accounts is the sole provider by
statutory default, and community admins are users. Its verdict: "The Facebook-Groups
analogy stands better than the doc's own hedging implies."

Then it turned that concession into the sharpest hole in the document.

**Hole 1, liability priced at zero.** The clause that creates the value proposition,
"that entity alone", concentrates the whole segment's regulatory exposure on one founder
personally. The ceiling is £18m or 10% of global revenue. Velocio shut LFGSS because
that personal risk was too high, which is the document's own source. The fee is strict
cost recovery with no margin, so it prices the founder's compliance time at £3k a year
and prices the risk transfer, the actual product, at zero. No legal reserve, no
insurance line. One CSAM incident or one Ofcom information notice eats the year's whole
compliance budget in solicitor hours. Either the fee grows a serious legal line, which
breaks the Discourse comparison, or the founder does for free what Velocio refused to do
at all.

**Hole 2, free structural substitutes.** It conceded the shelf is empty of vendors
marketing OSA carriage. But ProBoards and Forumotion are multi-tenant platforms whose
operators already control accounts, the same s.226(2) position, at price zero. An admin
can shed provider status today without paying anyone. It fetched a Forumotion staff
reply on age verification: "no plans as far as i know". So the sellable difference
narrows to compliance done seriously plus the ad-free posture, against free, ad-funded
and complacent.

**Hole 3, demand decaying by official design.** The government's petition response says
Ofcom will "take a sensible approach to enforcement with smaller services that present
low risk to UK users". Eighteen months in, the document cites zero small-forum
enforcement actions, and its own source records LFGSS reopening. Fear the regulator is
actively deflating is a decaying asset.

**It corrected the scorer.** The scorer's spot-checked claim that small forums sit in
Category 2B is wrong; Category 2B's floor is 3 million monthly UK users. One agent
catching another's cited error is the behaviour the whole design exists to produce.

---

## Three rounds of challenge and refine

The challenger and the refiner went back and forth three times. Each round moved on
fetched evidence rather than argument, and the exchange is the part of the run worth
reading in full in the idea document itself.

### Round 1: the refiner catches the challenger arguing both ways

Holes 1 and 3 are the same variable pulled in opposite directions. The challenger priced
the founder's exposure off the £18m statutory ceiling, then four paragraphs later priced
the buyer's fear off the government deflating that same threat. Both cannot stand at
full strength. If enforcement against low-risk small services really is rare, the legal
reserve is small and hole 1 shrinks. If exposure is severe enough to need a large
reserve, the fear is not decaying and hole 3 shrinks. The refiner said the Model would
"state the trade rather than quietly taking the favourable half of each".

On hole 1 it conceded the substance and rejected the conclusion. An insurance premium and
a legal reserve are costs like any other, forecast and trued up annually. Discourse gives
a 200-member community a $1,200 to $6,000 annual comparison band, so a four-figure legal
line still leaves the platform cheaper. And the Velocio comparison does not transfer: he
carried the duty as an unpaid volunteer with no budget line at all, while a platform
collecting a forecast fee has by construction the thing he lacked. Then it marked its own
limit. "It says the line can be funded, not that the tail is survivable."

On hole 2 it accepted the narrowing. An admin migrating to a free host attaches their
community to a provider that said on the record it has "no plans" to do anything.
Shedding the label is free; being hosted by a provider that discharges the duty is the
purchase. The claim moved from "we carry the duty" to "a provider that discharges it,
ad-free, at cost".

Most of all, it refused to fill four gaps from memory and opened fetch targets instead:
the real cost of UK cyber cover for a named OSA provider, a per-check age-assurance
price, a dated instance of any forum paying anyone for compliance relief, and who
operates lfgss.com today.

### Round 2: the challenger finds a live incumbent

Gap 8 closed, and it changed the picture. LFGSS was not rescued for free. The Microcosm
Collective CIC, company 16265268, incorporated 20 February 2025, verified on Companies
House. Users formed it with named directors carrying "the legal risk and responsibility
for running the service", and it took "a group of at least twenty people to replace
Velocio". The money came from Open Collective: €23,262 raised, €16,535 held, a
€15,699 annual budget against about €700/month hosting, from 291 contributors on €6/month
and €12/year tiers.

The challenger read it both ways against itself:

- **Against its own earlier point.** The alternative is not free. It took a CIC,
  directors accepting personal exposure, twenty volunteers and a five-figure fundraise.
  That lift is precisely what the product sells relief from. And 291 people paying real
  money into an ad-free, duty-carrying platform is the first observed willingness-to-pay
  instance in the whole thread.
- **A new objection.** The document's countable market leaned on "~300 orphaned Microcosm
  communities". They are not orphaned. The platform is back under the CIC, which now
  occupies the refined document's exact narrowed proposition at donation prices.

Gap 4 closed with one precision worth keeping: no community is observed paying a
commercial third party for compliance relief. What is observed is communities paying a
community-owned nonprofit. "Collective cost-recovery is proven; the commercial variant of
it remains unobserved."

### Round 3: the refiner drops the market number, and the challenger closes

The refiner removed "~300 orphaned Microcosm communities" from the body outright. That
number cannot survive the CIC evidence and a fetched thread reading "It was saved!".

It refused to settle the deciding question by argument: "I cannot settle it by argument
and I will not settle it from memory." Whether the CIC takes communities from outside the
existing Microcosm estate became gap 9, with three named routes to close it.

Two precisions cut the adverse reading down. The €54/year figure is an average over
voluntary donors, not a price, since 291 contributors fund the whole estate while most
members pay nothing. And CIC capacity is unsourced both ways, with €16,535 held against a
€15,699 annual budget being about one year of cover for the estate they already run. So
"incumbent for the whole segment" is an inference, and the refined body labels it a risk.

The digest rule fired here. The comment thread crossed its size threshold and the refiner
wrote a `### digest` entry, so later wakes read the digest plus everything after it.
Nothing was deleted.

The challenger then tried all three routes itself before ruling:

- **Companies House filing history, fetched.** CIC incorporation, two office changes, a
  confirmation statement made 2026-02-04 "with no updates". No CIC annual report on file,
  so the register cannot answer intake. One new fact extracted: the CIC is active into
  2026, so the incumbent reading is current.
- **Open Collective updates page, fetched: empty.** "No Updates" is the whole page.
- **`microcosm.app` returned 502 twice, the LFGSS thread 403 again.** A search snippet
  described microcosm.app as a platform "for non-profit communities", and the challenger
  refused to weigh it: "a snippet on an unfetchable page is not evidence and I will not
  weigh it."

Then the ruling, and the reason it terminates:

> What remains is a fetch list, not an argument [...] no line of argument I can construct
> would substitute for the fetches.

`challenge: resolved`. Three exchanges, no overseer intervention, ending because the two
roles agreed the remaining questions are not disputes between them.

---

## A fourth bug: the planner cannot go first

With the challenge resolved and the body refined, the idea moved to `ideas-3-refined/`.
The planner then woke and wrote nothing:

> **`RANKED.md`:** present but has zero rows [...] Step 2's gate fires: exit without
> writing.

`scripts/cycle.sh` runs the planner before the ranker. On a fresh generation `RANKED.md`
starts empty, so the planner always no-ops on the first pass, and graduation needs steps
the planner will not write until the ranker has published rows. It clears on the second
cycle, so it is a slow start rather than a deadlock, and nothing says so.

The planner also reported the permission problem more usefully than any other agent:

> I could not enumerate `ideas-operator-selected/` or `ideas-3-refined/`. Bash is denied
> in this mode, and `Read` on a directory returns `EISDIR`, so I have no listing tool.

`Read` on a directory returning `EISDIR` is the concrete reason `Glob` is the right grant.
Without Bash the agents have no listing capability at all.

Running the ranker first cleared it.

---

## The steps

The planner argued against the idea's own build plan, which was not something to expect.
Its opening line: "the build itself is much smaller than the Model's delivery shape
implies". Steps 1 and 2 are reads and emails, not code.

1. **Settle gap 9 before spending anything.** Read the CIC's 46-page incorporation PDF at
   Companies House. £0, an hour of reading. If it reads as hosting for non-profit
   communities generally, this idea's segment is whoever the CIC turns away. If it reads
   as the Microcosm estate only, the segment is open.
2. **Ask the CIC directly, and email the closed forums the same week.** Not a sale: would
   they pay a per-member annual fee to a company that carries the duty, and what do they
   pay for hosting now. Two signed letters of intent gate everything from step 4.
3. **Size the tail with one month of Ahrefs**, €27, or free tier if it covers the queries.
4. **Stand up on Discourse multisite, not a custom stack.** Free, open source, runs on a
   2 GB server, ships importers for phpBB3, vBulletin, XenForo, SMF, MyBB, IPBoard,
   Vanilla and NodeBB. Hosting $24/month on Lightsail. This collapses the Model's
   serverless multi-tenant build off the path to the first paying customer. The caveat is
   carried rather than hidden: Discourse's own docs say the team "is unable to provide
   multisite configuration support", and that unsupported sysadmin work is the real cost.
5. **Incorporate**, £100, usually within 24 hours. This is what makes s.226(2) point at a
   company rather than a person, and it is the difference between this and what Velocio
   was carrying.
6. **Get insurance quotes, and use the quoting process to close gap 7.** The written
   question to each broker: does the wording respond to an Ofcom information notice?
7. **Do the compliance work with Ofcom's own free toolkit** and publish its output. That
   is the visible discharge of duty the offer narrowed down to.
8. **Ship billing as annual invoices.** Stripe at 1.5% + 20p, about 28p per member per
   year on a £5 fee. Stripe Identity at £1.25 per check closes gap 2 with a real number.
9. **Migrate one community, in public**, and write it up. That write-up is the content
   that meets the empty query surface, and one completed migration is the only reference
   a second admin will care about.
10. **Set the first fee from the actual forecast, publish the arithmetic, and true it up.**
    The mechanism is the product's claim, so the arithmetic being visible is part of what
    is on sale.

Every cost is fetched. Two gaps are left explicitly open rather than papered over:
whether any insurance wording names the Act, and whether Ofcom accepts a Stripe Identity
check as highly effective.

The operating model: about £80 to £100 a month pre-revenue plus £100 to incorporate;
break-even at about 200 members for cash costs and about 800 with the compliance line in,
"reachable in two to three quarters only if the outreach list in step 2 converts". On
payback it says "~unknown, because cost recovery leaves no margin", and then says what
would set it.

---

## Graduated

```
commit: ranker: rebuild, graduate idea-0002
```

`ideas-4-ranked/idea-0002-osa-compliant-community-home-for-forums.md`, `status: ranked`.

**RANKED.md**

| rank | id | title | score | status | one-liner |
|---|---|---|---|---|---|
| 1 | idea-0002 | Cost-recovery community platform that carries Online Safety Act duties for small UK forums | 68 | ranked | Volunteers running small UK forums now carry Online Safety Act duties personally. |

The whole journey from the operator's first brief:

```
og-social brief          refused, no seed, all three gates fail
  + a day-one fee        idea-0001 seeded
                         scored 61, killed on the inbound-reachability gate
  + adapt directive      idea-0002 seeded, parent idea-0001
                         scored 68, both gates clear
                         contested -> refined -> contested -> refined -> contested
                         challenge: resolved
                         ranked, planned, graduated
```

---

## The realisation plan

The drafter turns a graduated idea into a plan a build session could execute. It wrote
`plans/PLAN_idea-0002-osa-compliant-community-home-for-forums.md`, 377 lines, marked
"draft, unreviewed. A coordinator read gates any build."

It opens by stating where the work goes: a fresh repository, `osa-community-home`. "It
does not happen in this repository."

**A constitution, taken from what survived the challenge.** No ads, no algorithmic feed,
member-directed data sharing. Strict cost recovery with published arithmetic, and a rule
that gives the mechanism teeth: "A fee the buyer cannot recompute from the published
inputs is a bug." An append-only compliance ledger, because the Act's record-keeping duty
is discharged by the ledger existing, so its integrity is a product invariant. The company
and never an individual admin is the s.226(2) provider. Deterministic money: the fee is a
pure function of a versioned input file, byte-for-byte reproducible.

**Operator gates, kept separate from build phases.** The plan takes the planner's first
instruction seriously and makes it a gate rather than a step. G1 gates all spend and
outreach: read the CIC filing, email the CIC, email the closure-list admins, incorporate,
one month of keyword sizing. Its exit condition is two signed letters of intent and a
known CIC intake posture. G2 gates the first migration: broker quotes with the written
Ofcom question, and a run of Ofcom's toolkit. "P1–P3 are code and cost nothing but time;
they proceed in parallel with G1."

**Six phases, four concurrent tracks**, each owning its own directory so they do not
collide, with a model tier picked per track and one named shared file.

**It made the decision the record left open.** On payback the idea document said
"~unknown" and named what would settle it. The plan settles it:

> The platform-operation line recovers running and operating time only; build time is not
> amortised into fees. Reason: the published-arithmetic mechanism is the product's trust
> claim, and a build-recovery line inflates year-one fees exactly when the comparison
> against Discourse Pro must hold. Consequence, stated plainly: payback on build time is
> indefinite and the founder carries it as equity.

Then it says how to overturn it: "A coordinator who wants build recovery in the forecast
overturns this one decision; the `fee-forecast.json` format takes it as just another
line."

**Six risks, each with a watch signal**, so a build session knows what to look at rather
than what to worry about. The CIC opening intake, watched at three named places. Fear
decay outrunning conversion, watched at the G1 reply rate. Insurance not responding to
Ofcom action, watched at the broker's written answer, with the consequence wired into the
code: "the legal-reserve line stays `unfilled` and every fee is `--provisional`". And on
the severe-enforcement tail: "the residual tail is named, not priced, because no source
prices it."

**What it left out, and why it is sequencing rather than refusal.** The parent's custom
serverless stack "returns as a cost optimisation when membership makes the single instance
the wrong shape". Non-UK regimes wait on a buyer outside the UK. A second age-assurance
method waits on the first pair being tested at G2.

---

## What the run cost

**30 wakes, $22.07, 19 commits.** From an operator brief that was refused outright, through
a child idea killed on the inbound gate, to a graduated grandchild with a ten-step
realisation plan.

The refinery's own output is in the repository: the idea document with its full comment
thread, `RANKED.md`, `docs/` with the fetched sources, and `plans/` with the draft plan.
Every stage is a commit, so `git log` is the audit trail.

## What running it actually taught

The refusals were more useful than the approvals.

The harvester refused the first brief outright and cited an eleven-year post-mortem for
why. The scorer killed the second idea on a gate rather than a total, and the reason it
gave was a mismatch between the demand evidence and the channel that nobody had noticed.
The challenger found a live incumbent in Companies House that the idea's own market number
depended on not existing. The refiner deleted that market number from the body rather than
defending it. The planner argued the build was smaller than the idea claimed.

Four template bugs came out of a single run, and the worst was the quiet one. An agent that
cannot list a directory reports an empty bucket, exits clean, and commits nothing. On a
continuous run that reads as an idle funnel rather than a broken one.
