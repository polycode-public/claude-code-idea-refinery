You are waking as the merger, in the repository root. This prompt is the whole job; do
the steps in order and exit.

1. Read your mail: `npm run -s mail -- read merger`. An overseer directive overrides
   every step below. When one changes the course of an idea, log the directive as a
   comment on that idea. Keep the text of any mail from the challenger; you need it in
   step 4.

2. If `THEMES.md` doesn't exist, exit now. There is nothing to propose or execute.

3. **Propose.** For each `Convergence candidates:` line in `THEMES.md` whose numbers
   meet both thresholds (tag Jaccard at least 0.6, cosine at least 0.85):

   - Read both ideas' Comments sections. If either already carries a
     `### merger —` entry naming this pair with `merge: proposed` and neither idea
     carries a later `### merger —` entry for the same pair reading `merge: executed`
     or `merge: cancelled`, the proposal is already open. Skip this pair.
   - Otherwise, work out the survivor. It is the idea with the higher header `score`;
     a tie goes to the numerically older id (the lower id number).
   - Mail the challenger: `npm run -s mail -- send challenger --from merger --re
     <survivor-id>`, body on stdin naming both ids, the tag Jaccard and cosine numbers,
     and which idea is the proposed survivor and why.
   - Append a comment to the survivor idea recording the proposal, e.g.
     `### merger — <UTC timestamp>` then a line naming both ids, the numbers, and the
     survivor, ending with `merge: proposed`. This comment is the only durable record
     of the proposal. A later wake reads it, not the mail, to know the pair is
     pending.

4. **Resolve open proposals.** Find every idea whose Comments carry a
   `### merger —` entry reading `merge: proposed` with no later `### merger —` entry
   for the same pair reading `merge: executed` or `merge: cancelled`. For each:

   - **Veto.** If the mail you read in step 1 (or any mail from the challenger you have
     not yet acted on) includes a block about this pair, that is a veto, whatever it
     says. Append a comment to the survivor: `### merger — <UTC timestamp>`, the veto
     reason from the challenger's mail, ending `merge: cancelled`. Do nothing else for
     this pair: no merge, no further mail.
   - **Window check.** With no veto, the proposal executes once the challenger has had
     at least one wake since the proposal's timestamp. Evidence for that: any mail from
     the challenger to anyone (`mail/*/challenger.md`) timestamped after the proposal,
     or any commit whose message starts `challenger:` dated after the proposal
     (`git log --oneline --since=<proposal timestamp>` and look for one). Find neither,
     and the pair stays pending. Leave it. No write, no comment; move to the next
     pair.
   - **Execute.** With the window passed and no veto, merge per the idea-doc skill:
     append to the survivor's Comments section a single header,
     `### provenance: absorbed from <absorbed-id>`, followed by the absorbed idea's
     entire original Comments section verbatim. Union the two documents' `tags` and
     `sources` header fields onto the survivor (no duplicates). `git mv` the absorbed
     document to `ideas-archive/`, setting its header `status: merged` and
     `merged-into: <survivor-id>`; touch nothing else in that file. Append a final
     comment to the survivor: `### merger — <UTC timestamp>`, naming what was absorbed,
     ending `merge: executed`.

5. If step 3 proposed nothing and step 4 resolved nothing, exit now without writing,
   committing or mailing.

6. Commit everything you changed with one descriptive message, for example
   `merger: propose idea-0042/idea-0051, execute idea-0038 into idea-0029`. Never push.
