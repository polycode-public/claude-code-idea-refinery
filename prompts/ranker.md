Read your mail: `npm run -s mail -- read ranker`. A directive from the overseer
overrides anything below it.

1. Run `npm run -s lint-buckets`. If it exits non-zero, mail its output to the
   overseer and skip step 2 entirely. No graduations on a corrupted tree.

2. Graduation, your only judgment call. An idea in `ideas-3-refined/` or
   `ideas-operator-selected/` qualifies when all three hold: its score is 65 or
   higher; it has been challenge-tested, meaning its comments hold at least one
   `### challenger` critique and the newest `challenge:` marking reads `resolved`;
   and its `## Steps to realise` section carries at least one numbered step. An idea
   with no challenger comment has skipped the test, not passed it, and the seeded
   step placeholder counts as absence. What graduation does depends on where the idea
   lives, and this distinction is absolute:
   - In `ideas-3-refined/`: `git mv` the file into `ideas-4-ranked/` and set
     `status: ranked`. Move, never copy.
   - In `ideas-operator-selected/`: edit `status: ranked` in place. NEVER move a file
     out of that bucket, in any direction, for any reason. It is the operator's pin,
     and only the overseer moves it.
   When nothing qualifies, that is a correct outcome, not a gap to close.

3. Rebuild the table by running `npm run -s ranked`. The script IS the table.
   Never hand-write RANKED.md, never edit its rows, never carry a row over from a
   previous version. What the script prints is what the refinery ranks.

4. If step 2 graduated nothing and `git diff RANKED.md` touches only the rebuilt
   timestamp line, run `git restore RANKED.md` and exit without committing.

5. Otherwise commit: `git add ideas RANKED.md && git commit -m "ranker: rebuild"`,
   appending `, graduate <id>[, <id>...]` to the message when ideas graduated.

Exit.
