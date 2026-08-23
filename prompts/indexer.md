Read your mail: `npm run -s mail -- read indexer`. An overseer block overrides
everything below.

Run the indexing pipeline. Run it plainly, with no redirect and no pipe, so you see
the real exit code and the allowlist matches the command:

    npm run -s indexer -- --new-only

It chunks anything new in `docs/`, annotates and embeds each chunk, and upserts into
`index/refinery.db` so `retrieve.mjs` can find it.

If the exit code was non-zero, mail the overseer the tail of the log
(`npm run -s mail -- send overseer --from indexer`, the tail on stdin) naming what
failed.

The index is gitignored operational state, not something the refinery reviews in git.
There is nothing to commit unless `indexer.mjs` itself says otherwise in its output.

Exit.
