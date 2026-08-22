import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as markedNs from "marked";
import { createServer } from "../src/viz/server.mjs";

const PAGE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "viz",
  "page.html",
);

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "viz-page-test-"));
}

async function withServer(root, fn) {
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

// Extracts a script block from page.html by id and runs it in a fresh vm
// context, so the tests exercise exactly the code the browser runs.
function runPageScript(id, context = {}) {
  const html = fs.readFileSync(PAGE_FILE, "utf8");
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(match, `page.html has no <script id="${id}"> block`);
  const ctx = vm.createContext(context);
  vm.runInContext(match[1], ctx);
  return ctx;
}

test("/ serves the page with its read-only statement", async () => {
  const root = tmpRoot();
  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const html = await res.text();
    assert.match(html, /Read-only\. Changes happen in Claude Code\./);
    assert.match(html, /The Idea Refinery/);
  });
});

test("the page references no cross-origin URL", () => {
  const html = fs.readFileSync(PAGE_FILE, "utf8");
  let checked = 0;
  for (const attr of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = attr[1];
    // Template placeholders are runtime values; the markdown tests prove
    // what those may hold. This test is about the page's static references.
    if (url.includes("${")) continue;
    checked += 1;
    assert.ok(
      url.startsWith("/") || url.startsWith("#") || url.startsWith("data:"),
      `cross-origin reference in page.html: ${url}`,
    );
  }
  assert.ok(checked >= 8, `expected static references to check, saw ${checked}`);
});

test("/api/state carries root, tiers and the tmux shape the page reads", async () => {
  const root = tmpRoot();
  fs.writeFileSync(
    path.join(root, "caps.json"),
    JSON.stringify({ scorer: { dailyUsd: 5, wakeUsd: 1, dailyWakes: 60 } }),
  );
  fs.mkdirSync(path.join(root, ".claude", "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claude", "agents", "scorer.md"),
    "---\nname: scorer\nmodel: sonnet\n---\n\nprompt\n",
  );

  await withServer(root, async ({ base }) => {
    const body = await (await fetch(`${base}/api/state`)).json();
    assert.equal(body.root, root);
    assert.equal(body.tiers.scorer, "sonnet");
    assert.equal(typeof body.tmux.state, "string");
  });
});

test("viz-pure: escapeHtml neutralises markup characters", () => {
  const { VizPure } = runPageScript("viz-pure");
  assert.equal(
    VizPure.escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
});

test("viz-pure: agentState reads tmux windows, STOP files and caps", () => {
  const { VizPure } = runPageScript("viz-pure");
  const tmuxUp = { state: "running", windows: ["1:scorer", "2:ranker"] };
  const caps = { dailyUsd: 5, dailyWakes: 60 };

  assert.equal(
    VizPure.agentState({ name: "scorer", tmux: tmuxUp, stop: [], caps, wakesToday: 3, costToday: 1 }),
    "awake",
  );
  assert.equal(
    VizPure.agentState({ name: "scorer", tmux: tmuxUp, stop: [], caps, wakesToday: 3, costToday: 5 }),
    "dozing",
  );
  assert.equal(
    VizPure.agentState({ name: "scorer", tmux: tmuxUp, stop: ["STOP.scorer"], caps, wakesToday: 0, costToday: 0 }),
    "asleep",
  );
  assert.equal(
    VizPure.agentState({ name: "ranker", tmux: { state: "down", windows: [] }, stop: [], caps }),
    "asleep",
  );
});

test("viz-pure: refineryPhrase names sprint, cruise, down and missing tmux", () => {
  const { VizPure } = runPageScript("viz-pure");
  assert.equal(VizPure.refineryPhrase({ state: "running", profile: "sprint" }), "running sprint");
  assert.equal(VizPure.refineryPhrase({ state: "running", profile: "cruise" }), "running cruise");
  assert.equal(VizPure.refineryPhrase({ state: "running", profile: null }), "running");
  assert.equal(VizPure.refineryPhrase({ state: "down" }), "down");
  assert.equal(VizPure.refineryPhrase({ state: "unknown" }), "state unknown — tmux not found");
});

test("viz-pure: agentFromLogPath accepts log files only", () => {
  const { VizPure } = runPageScript("viz-pure");
  assert.equal(VizPure.agentFromLogPath("logs/scorer.jsonl"), "scorer");
  assert.equal(VizPure.agentFromLogPath("logs/scorer.err"), "scorer");
  assert.equal(VizPure.agentFromLogPath("mail/scorer/harvester.md"), null);
});

test("viz-pure: splitIdeaBody and parseComments read a thread as a conversation", () => {
  const { VizPure } = runPageScript("viz-pure");
  const body = `# Idea

The document itself.

## Comments

### harvester — 2026-08-22T11:10Z
Seeded from a signal.

### challenger — 2026-08-22T13:47Z
Contested. Sub-heads inside a comment stay inside it:

### Named gaps (each a fetch task, none a fact)
- one gap
`;
  const { prose, thread } = VizPure.splitIdeaBody(body);
  assert.match(prose, /The document itself\./);
  assert.doesNotMatch(prose, /Seeded from/);

  const comments = VizPure.parseComments(thread);
  assert.equal(comments.length, 2);
  assert.equal(comments[0].author, "harvester");
  assert.equal(comments[0].stamp, "2026-08-22T11:10Z");
  assert.equal(comments[0].body, "Seeded from a signal.");
  assert.equal(comments[1].author, "challenger");
  assert.match(comments[1].body, /### Named gaps/);
});

// The sanitisation path: the page's own viz-markdown block, run against the
// real marked library. Nothing an agent wrote may reach the screen as markup.
function safeMarkdown() {
  const pure = runPageScript("viz-pure");
  const md = runPageScript("viz-markdown");
  md.VizMarkdown.configureMarked(markedNs, pure.VizPure.escapeHtml);
  return (src) => md.VizMarkdown.renderMarkdownSafe(markedNs, src);
}

test("a script tag in a document renders as escaped text, never as markup", () => {
  const render = safeMarkdown();
  const out = render("# Title\n\n<script>alert(1)</script>\n\nAfter.");
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(out, /<h1>Title<\/h1>/);
});

test("inline HTML in a document renders as escaped text", () => {
  const render = safeMarkdown();
  const out = render('before <img src=x onerror="alert(1)"> after');
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("a javascript: link loses its href; a https link keeps it", () => {
  const render = safeMarkdown();
  const bad = render("[click](javascript:alert(1))");
  assert.doesNotMatch(bad, /javascript:/);
  assert.doesNotMatch(bad, /<a /);
  assert.match(bad, /click/);

  const good = render("[docs](https://example.com)");
  assert.match(good, /<a href="https:\/\/example\.com" rel="noopener">docs<\/a>/);
});

test("markdown images render as text — the page never fetches what a document embeds", () => {
  const render = safeMarkdown();
  const out = render("![diagram](https://example.com/x.png)");
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /\[image: diagram\]/);
});

test("/assets/marked.js serves the library from node_modules", async () => {
  const root = tmpRoot();
  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/assets/marked.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /javascript/);
    const js = await res.text();
    assert.ok(js.length > 10_000, "marked.umd.js looks too small");
    assert.match(js, /marked/);
  });
});

test("/api/artifacts lists plans with their Status: line and digests newest first", async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "plans"));
  fs.mkdirSync(path.join(root, "digests"));
  fs.writeFileSync(
    path.join(root, "plans", "PLAN_idea-0001.md"),
    "# PLAN idea-0001\n\nStatus: BUILD-READY — waiting on the operator.\n",
  );
  fs.writeFileSync(path.join(root, "plans", "REVIEW_idea-0001.md"), "# review, no status line\n");
  fs.writeFileSync(path.join(root, "digests", "DIGEST_2026-08-01.md"), "# a\n");
  fs.writeFileSync(path.join(root, "digests", "DIGEST_2026-08-02.md"), "# b\n");
  fs.writeFileSync(path.join(root, "RANKED.md"), "# ranked\n");

  await withServer(root, async ({ base }) => {
    const body = await (await fetch(`${base}/api/artifacts`)).json();
    assert.equal(body.ranked, true);
    assert.equal(body.themes, false);
    assert.deepEqual(body.plans, [
      { name: "PLAN_idea-0001.md", status: "BUILD-READY — waiting on the operator." },
      { name: "REVIEW_idea-0001.md" },
    ]);
    assert.deepEqual(body.digests, [
      { name: "DIGEST_2026-08-02.md" },
      { name: "DIGEST_2026-08-01.md" },
    ]);
  });
});
