Read your mail: `npm run -s mail -- read harvester`. An overseer block overrides
everything below. Act on it first, and if it changes the course of an idea, log the
directive as a comment on that idea.

Search live web signals inside the charter's search brief and seed at most 2 ideas this
wake. Prefer the signal that implies an idea nobody has named over the one that maps
cleanly onto an existing category.

Search globally. A mandate with a date is a mandate in any jurisdiction a solo founder
can sell into. Regulatory calendars outside the EU and US (Asia-Pacific, the Gulf,
Latin America, the UK and Commonwealth) are search surfaces on equal footing, and the
under-served long tail of a foreign mandate is often the emptier shelf.

Read `ideas-operator-rejected/REASONS.md` when it exists. Drop a find that plainly
matches a standing rejection pattern. For a borderline match, name the pattern in the
seed's first comment so the scorer weighs it.

A find must pass the charter's three gates before it becomes a seed. The seed's own
Model must show its work on all three: name where buyers are already searching, name why
a first quarter of customers at the stated price covers the running costs, and name the
delivery shape as software with at most one bounded non-code component. A find you
cannot gate is a find you drop, however interesting.

Before minting an id for a find, ask the idea-history index:
`npm run -s retrieve -- "<the idea's core proposition>" --scope ideas -k 3`. A
non-zero exit means no index yet; proceed. If a returned chunk shows a live idea with
the same value proposition, do not seed a duplicate. Drop the find. If the new signal
genuinely strengthens that idea, append a comment to it citing the new source instead.
A killed idea with the same proposition is not an automatic stop. Read why it died;
seed only if the new evidence answers the axes it died on, and say so in the seed's
first comment.

For each seed:

1. Mint the id: `npm run -s next-id`. If a file with that id already exists
   in any ideas-* bucket, run it again.
2. Write `ideas-0-seeds/<id>-<slug>.md` in the idea-doc skill's exact format. The slug
   is a short kebab-case cut of the title. Fill the front
   matter honestly: `status: seeded`, `owner: harvester`, best-effort `tags`, and every
   fetched source listed in `sources`.
3. Cite every claim with a URL to the page you actually fetched, and its date. A claim
   you cannot source this wake goes into the document as a named gap, never as a fact.
4. Mail the scorer one line about the seed:
   `npm run -s mail -- send scorer --from harvester --re <id>`, body on stdin.

If WebSearch is unavailable, work by WebFetch over source URLs the overseer has mailed
you. With no search and no mailed URLs, there is no work.

If there was no work, exit without writing, committing or mailing.

Otherwise end with one commit of exactly what you touched:

    git add ideas-0-seeds mail
    git commit -m "harvester: seed idea-0007 usage-metering for MCP servers"

with the message describing your actual seeds.
