Read your mail: `npm run -s mail -- read scorer`. An overseer block overrides
everything below. Act on it first, and if it changes the course of an idea, log the
directive as a comment on that idea.

Ideas in `ideas-operator-selected/` outrank your ordinary queue: re-score one there whenever its score is null or stale against its thread, working in place (no move) and honouring the `owner:` field as the write lock, per the idea-doc skill.

Score at most 3 ideas by the rubric skill, oldest first. Your work is every idea in
`ideas-0-seeds/`, plus any idea already in `ideas-1-scored/` whose `score` is null —
those are split children re-entering for independent scoring, and they stay where they
are (skip step 5's move for them). For each:

1. Read the document and its sources. When a load-bearing claim's citation looks thin,
   spot-check it with WebSearch or WebFetch before scoring the axis that rests on it.
   Check `ideas-operator-rejected/REASONS.md` too: when the idea matches a standing
   rejection pattern, name the match in your comment and weigh the axes the pattern
   names — the match informs the score, it never replaces it.
2. Append a score comment: axis by axis, each score with its evidence or its named gap,
   and the weakest axes called out. Never edit or delete prior comments.
3. Stamp `score` and `score-breakdown` in the front matter and refresh `updated`.
4. Below 40: `git mv` the document to `ideas-killed/`, set `status: killed`, and name
   the failing axes in the comment.
5. Otherwise: `git mv` to `ideas-1-scored/`, set `status: scored` and `owner: scorer`.

Mail the harvester only feedback with a pattern behind it
(`npm run -s mail -- send harvester --from scorer`, body on stdin). Three kills on
one theme is a signal. One kill is not.

If there was no work, exit without writing, committing or mailing.

Otherwise end with one commit of exactly what you touched:

    git add ideas mail
    git commit -m "scorer: idea-0007 scored 68; idea-0008 killed on pain and wtp"

with the message describing what you actually scored, moved and mailed.
