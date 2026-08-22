---
name: mail
description: The mail block format, how to send and read it, and the hop limit.
---

# Mail

Agents talk through append-only files: `mail/<recipient>/<sender>.md`, one file per
recipient-sender pair. A message is one block:

```markdown
--- from: scorer  at: 2026-08-21T10:15Z  re: idea-0042  hops: 4 ---
Scored 68; inbound reachability is the weak axis. Worth a challenge pass
on whether SEO alone can reach indie API authors.
```

`from` names the sender, `at` is the UTC timestamp, `re` names the idea the message is
about (omit if it isn't about one idea), `hops` counts handoffs about that same idea.

## Using the mail command

- `npm run -s mail -- send <recipient> --from <agent> [--re <id>] [--hops <n>]` —
  body on stdin. Appends a block to `mail/<recipient>/<sender>.md`, creating the file
  and directory if they don't exist yet.
- `npm run -s mail -- read <agent>` — prints every unread block across all senders,
  labelled by sender, then advances that sender's cursor to the timestamp of the newest
  block it just printed. A block that lands mid-wake stays unread until the next wake.
- `npm run -s mail -- peek <agent>` — same output, no cursor movement.

Cursors are the script's business. Never hand-edit one — read and peek are the only
correct way to touch what's been seen.

## The hop rule

`hops` increments on each reply about the same idea. At 12 hops, don't reply to the
other agent — write to the overseer's inbox instead
(`npm run -s mail -- send overseer --from <agent> --re <id>`), explaining what the
back-and-forth couldn't settle. `send` enforces this: it refuses a send with `hops` at
or above 12 to anyone but the overseer, so the anti-ping-pong rule holds even if a
prompt forgets it.
