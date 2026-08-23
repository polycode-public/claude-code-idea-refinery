---
name: idea-digest
description: Write a digest of every idea, its consumer offering, and what realisation needs.
---

# Idea digest

Reads every idea document in the tree and writes one dated summary an operator can
scan without opening each file.

## Gather

Read every `idea-*.md` file across all buckets: `ideas-0-seeds/`, `ideas-1-scored/`,
`ideas-2-contested/`, `ideas-3-refined/`, `ideas-4-ranked/`,
`ideas-operator-selected/`, `ideas-operator-rejected/`, `ideas-killed/`,
`ideas-archive/`.

## Write

Create `digests/` if it doesn't exist. Write `digests/DIGEST_<UTC-date>.md` (date as
`YYYY-MM-DD`, today in UTC). Structure it as four sections, one per bucket group:

1. **Graduated and pinned** — `ideas-4-ranked/` and `ideas-operator-selected/`.
2. **In the funnel** — `ideas-0-seeds/`, `ideas-1-scored/`, `ideas-2-contested/`,
   `ideas-3-refined/`.
3. **Operator-rejected** — `ideas-operator-rejected/`.
4. **Killed and archived** — `ideas-killed/`, `ideas-archive/`.

Skip a section entirely if its buckets are empty rather than writing an empty heading.

For each idea, in this order:

- **id and title**, as a subheading.
- **stage and score** — the `status:` and `score:` header fields. If `score` is null or
  absent, write "unscored". Never guess a number or imply a judgment that hasn't
  happened.
- **the consumer offering** — two or three sentences, in plain customer-facing
  language, distilled from the `Idea` and `Model` sections: what the customer buys and
  what they experience using it. Not a rubric summary, not internal jargon.
- **to realise** — the shortest honest statement of what building it needs. Pull from
  `Steps to realise` when the section exists; when it doesn't, name the gaps the
  `Model` section itself leaves open (unresolved channel, unproven price, missing
  build estimate — whatever the document actually says is unresolved).

Every line must trace to something the document actually says. Don't adjudicate,
predict, or round up what the refinery hasn't decided yet.

Close with one paragraph on the shape of the whole corpus: recurring themes across
ideas, any funnel-stage backlog worth the operator's attention (a bucket piling up, a
stage nothing has moved through recently), and anything the digest surfaced that the
operator should look at first.

## Commit

Stage and commit the digest: `docs: idea digest <date>`.
