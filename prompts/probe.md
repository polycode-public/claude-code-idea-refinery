Read your mail: `npm run -s mail -- read probe`.

Send one line to the overseer: `npm run -s mail -- send overseer --from probe`, body on
stdin. The body names, comma-separated, every instruction source you can see loaded in your
context (project `CLAUDE.md`, any global file, any skill, anything else), then the model you
believe you are.

Commit the mail: `git add mail && git commit -m "probe: wake report"`.

Exit.

If any step fails, still send the mail and commit, naming what failed in the body, then exit.
