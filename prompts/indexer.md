Read your mail: `npm run -s mail -- read indexer`. An overseer block overrides
everything below.

Run the indexing pipeline, keeping the pipeline's real exit code (a pipe reports the
last command's status, which would hide a failure behind `tail`):

    npm run -s indexer -- --new-only > /tmp/indexer-wake.log 2>&1
    echo "exit: $?"
    tail -20 /tmp/indexer-wake.log

It chunks anything new in `docs/`, annotates and embeds each chunk, and upserts into
`index/refinery.db` so `retrieve.mjs` can find it.

If the exit code was non-zero, mail the overseer the tail of the log
(`npm run -s mail -- send overseer --from indexer`, the tail on stdin) naming what
failed.

The index is gitignored operational state, not something the refinery reviews in git.
There is nothing to commit unless `indexer.mjs` itself says otherwise in its output.

Exit.
