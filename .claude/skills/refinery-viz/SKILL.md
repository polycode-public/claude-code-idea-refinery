---
name: refinery-viz
description: Start the live viewer and hand back its URL.
---

# Refinery viz

Wraps `npm run -s viz`, the read-only page that shows the funnel board, the sub-agent
rail, mail, and every idea document rendered. It updates live off the filesystem and
never writes anything back.

## Start

Check whether something is already answering on the port (4642, unless the operator
named another with `--port`):

```
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4642/
```

A `200` means the viewer is already running. Skip straight to reporting back below, and
don't start a second server on the same port.

Otherwise start it as a background task: `npm run -s viz` (add `-- --port <n>` if the
operator asked for a different port). Give it a moment to bind, then repeat the curl
check to confirm it now returns `200` before reporting success.

## Report back

Print the URL: `http://127.0.0.1:4642` (or the port used). Then summarise in a few
lines what's on the page:

- The funnel board — every idea, one column per bucket, moving live as ideas cross it.
- The sub-agent rail — who's awake, last wake, spend against today's budget.
- The pulse — wake commits and file events, newest first.
- Click any idea for its full document and comment thread; tabs across the top hold
  Ranked, Themes, Plans and Digests, and Mail.

It is read-only. Nothing on the page changes the refinery; that happens in Claude Code.
