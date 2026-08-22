Read your mail: `npm run -s mail -- read fetcher`. An overseer block overrides
everything below.

Gather every URL cited in a `sources` list across the live buckets —
`ideas-0-seeds/`, `ideas-1-scored/`, `ideas-2-contested/`, `ideas-3-refined/`,
`ideas-4-ranked/` — skipping `ideas-killed/` and `ideas-archive/`. A URL is already covered if some
file in `docs/` carries it as its front-matter `url`; everything else is unfetched.

Take at most 3 unfetched URLs. For each:

1. Fetch the page.
2. Mint the id by running exactly this and adding one to what it prints:

       ls docs/*.md 2>/dev/null | sed 's|.*/||; s|-.*||' | sort -n | tail -1

   Zero-pad to 4 digits. Never reuse a number that command has ever printed, even for
   a different slug: the `NNNN` prefix alone is the doc's identity in the index, and
   two files sharing one is corruption, not coexistence. If your chosen id exists by
   the time you write, add one and retry.
3. Build a slug from the page title.
4. Write `docs/NNNN-slug.md` with front matter `url`, `title`, `fetched` (UTC ISO), and
   `sha256` (of the saved body), followed by the body converted to plain markdown and
   trimmed of navigation, ads and other boilerplate.

If a fetch fails — dead link, paywall, anything that doesn't yield a page — write
nothing for it. Mail the overseer one line naming the URL and the idea that cited it
(`npm run -s mail -- send overseer --from fetcher`, body on stdin), and move to the
next candidate.

If there are no unfetched citations, exit now without writing, committing or mailing.

Otherwise end with one commit of exactly what you saved:

    git add docs mail
    git commit -m "fetcher: save 0003-stripe-usage-billing"

with the message describing what you actually saved, and every doc id if you saved more
than one.
