---
name: rubric
description: The seven scoring axes, the weights, and when an idea is killed or graduates.
---

# Rubric

Every idea is scored on seven axes, each 1 to 5, each with a fixed weight:

| axis | weight |
|---|---|
| pain | 20 |
| willingness-to-pay | 20 |
| inbound reachability | 15 |
| buildability | 15 |
| COGS | 10 |
| competitor density | 10 |
| risk | 10 |

Score is the sum of each axis times its weight, divided by 5, rounded to an integer:

```
score = round( sum(axis_score × axis_weight) / 5 )
```

A perfect 5 on every axis gives 100; a 1 on every axis gives 20.

What each axis measures:

- **pain** — how sharp and frequent the problem is for the named customer.
- **willingness-to-pay** — evidence the customer pays for relief, at what anchor.
- **inbound reachability** — whether demand already exists and is searching. A 5 means
  buyers are looking for this now (a mandate, a deadline, a live complaint stream) and
  can be found where they look; needing to create the category or educate the market
  caps this axis at 2, however reachable the audience is.
- **buildability** — how far one technical founder gets, and how much of the delivery
  is pure software. A 5 means shippable by one person as code alone; every part that
  needs ongoing human service, content upkeep, or physical process subtracts.
- **COGS** — unit economics of serving one customer, token costs included.
- **competitor density** — how crowded the space is, weighted by how directly rivals
  serve this customer.
- **risk** — what kills it: platform dependence, regulatory reversal, single-source
  evidence.

Record the breakdown in the header (`score-breakdown`) and the total (`score`), and say
in a comment which axes were weakest.

## Kill and graduation

- Below 40: kill. Move to `ideas-killed/`, name the failing axes in the comment.
- The charter's three gates kill regardless of total score, each named in the comment
  when it fires:
  - `inbound reachability` below 4 — the refinery pursues captured demand only.
  - `buildability` below 4 — software-shaped delivery only.
  - the quarter test — the Model's cited numbers show a structural blocker to revenue
    covering running costs within roughly a quarter (volume-dependent pennies,
    education-lengthened cycles, third-party-adoption dependence). This is a judgment
    from the Model section, not an axis; name the blocker.
- At or above 65, challenge-tested and planned: the idea graduates to
  `ideas-4-ranked/`. Challenge-tested means at least one challenger critique exists
  and the newest challenge marking reads `challenge: resolved`. An idea nobody has
  contested has not passed the test; it has skipped it. Planned means the
  `Steps to realise` section carries at least one numbered step; the seeded
  placeholder is absence. Graduation moves the file with `git mv`. A copy that
  leaves the id in two buckets is corruption, and finding one is a mail to the
  overseer.
- Between 40 and 65, or above 65 without a resolved challenge or without steps: the idea
  stays live in its current bucket.

## The evidence rule

Score every axis from a cited, dated source, never from memory of what used to be
true. If there's no current source for a claim an axis depends on, that axis scores low
and the comment names the gap. A remembered fact about how something used to work is a
reason to go find a current source, not a substitute for one.
