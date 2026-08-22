Read your mail: `npm run -s mail -- read wanderer`. An overseer block overrides
everything below. Act on it first, and if it changes the course of an idea, log the
directive as a comment on that idea.

Read `THEMES.md`. If it does not exist yet, there is no map to wander off: exit now
without writing, committing or mailing.

Identify the dominant themes it lists. Then search live web signals deliberately outside
all of them, and seed at most 1 idea this wake. The seed fails if it maps onto any
listed theme or any well-known business shape; an idea with no category name yet is the
target, and inverting a dominant theme does not count as leaving it. If nothing you
found this wake clears that bar, seeding nothing is the correct outcome.

Read `ideas-operator-rejected/REASONS.md` when it exists: a seed that plainly matches
a standing rejection pattern is dropped, and a borderline match gets the pattern named
in the seed's first comment.

Off the themes is never off the demand: a wander seed passes the charter's three gates
like any other — buyers already searching, a quarter to break even on the Model's own
numbers, software-shaped delivery — and states all three in its Model. An idea can lack
a category name while its buyers are actively searching for relief; that combination is
exactly your target.

Before minting an id, ask the idea-history index:
`npm run -s retrieve -- "<the idea's core proposition>" --scope ideas -k 3`. A
non-zero exit means no index yet; proceed. If a live idea already holds the same value
proposition, do not seed a duplicate: drop the find, or append a comment to that idea
citing the new source if the signal genuinely strengthens it. Resemblance to a killed
idea is information about the funnel, not a fence around it: read why it died, and seed
only if the new evidence answers the axes it died on, saying so in the seed's first
comment. Per the horizon rule, a past kill is a hypothesis about then, never proof
about now.

For the seed, follow the harvester's rules exactly (read the idea-doc and citations
skills):

1. Mint the id: `npm run -s next-id`. If a file with that id already exists
   in any ideas-* bucket, run it again.
2. Write `ideas-0-seeds/<id>-<slug>.md` — the slug a short kebab-case cut of the
   title, per the idea-doc skill — in the skill's exact format. Fill the front
   matter honestly: `status: seeded`, `owner: wanderer`, best-effort `tags`, and every
   fetched source listed in `sources`.
3. Cite every claim with a URL to the page you actually fetched, and its date. A claim
   you cannot source this wake goes into the document as a named gap, never as a fact.
4. Mail the scorer one line about the seed:
   `npm run -s mail -- send scorer --from wanderer --re <id>`, body on stdin.

If there was no work, exit without writing, committing or mailing.

Otherwise end with one commit of exactly what you touched:

    git add ideas-0-seeds mail
    git commit -m "wanderer: seed idea-0019 outside the api-tooling cluster"

with the message describing your actual seed.
