---
name: citations
description: What counts as a source and how to cite one.
---

# Citations

A source is a `docs/` chunk id (`docs/NNNN-slug.md#cN`) once the fetcher has saved the
page and the indexer has indexed it. Verify a chunk id locally before citing it:
`npm run -s retrieve -- "<query>"` prints chunk ids and text from the fused index.

A URL is a valid citation for a claim whose page the fetcher hasn't saved yet. While
`docs/` is still sparse that's the normal state, not a shortcut — the fetcher closes the
gap within a wake or two of a URL turning up in an idea's `sources`. Once a claim's doc
lands in `docs/`, its URL citation is stale; cite the chunk id instead.

The scorer requires a chunk id for every new score once the underlying doc exists
locally — a URL still on the books for a doc that's already landed is a gap, not a pass.
The refiner upgrades old URL citations to chunk ids opportunistically whenever it
rewrites a body; it doesn't sweep the corpus for stale ones. The challenger runs
`retrieve.mjs` over the local library before reaching for the web, so its critiques cite
the same evidence the rest of the refinery already holds.

Quotes stay a phrase, never a paragraph. The library exists so agents can point at
where a claim comes from, not to republish source material.

Every scored claim carries a source. A claim with nothing backing it is not a claim the
rubric can score — it's a gap, and the comment says so.

Any claim about current buildability, cost, tooling, or competition needs a dated
source from the recent past. This is the citation half of the horizon rule: what a
model remembers about how something used to work is a hypothesis to go check, never
evidence on its own.
