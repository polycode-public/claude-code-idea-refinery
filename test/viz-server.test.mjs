import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createServer, ROUTE_TABLE } from "../src/viz/server.mjs";

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "viz-test-"));
}

function writeFile(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

async function withServer(root, fn) {
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, port });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

// Bypasses http.request's own URL parsing (which, like a browser, would
// collapse "../" before the request ever left the process) so a traversal
// attempt reaches the server exactly as an attacker would send it.
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: rawPath, method: "GET" },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function ideaFixture({ id = "idea-0001", title = "Test idea", status = "contested", score = "70" } = {}) {
  return `---
id: ${id}
title: ${title}
status: ${status}
owner: challenger
created: 2026-08-01T00:00Z
updated: 2026-08-02T00:00Z
tags: [alpha, beta]
score: ${score}
score-breakdown: {pain: 4, wtp: 3, inbound: 2, build: 4, cogs: 4, density: 3, risk: 3}
parent: null
merged-into: null
sources:
  - https://example.com/one
  - https://example.com/two
hops: 0
---

# Idea

A test idea body paragraph. It says something worth reading.

## Comments
`;
}

test("the route table holds nothing but GET routes, no mutating handler", () => {
  assert.ok(ROUTE_TABLE.length >= 8);
  for (const route of ROUTE_TABLE) {
    assert.equal(route.method, "GET", `${route.path} is not GET-only`);
  }
});

test("/api/state reports buckets, caps, stop files and tmux liveness", async () => {
  const root = tmpRoot();
  writeFile(root, "ideas-2-contested/idea-0001-test.md", ideaFixture());
  writeFile(
    root,
    "caps.json",
    JSON.stringify({
      cliVersion: "1.0.0",
      harvester: { dailyUsd: 40, wakeUsd: 3, dailyWakes: 60, sprintSeconds: 300, cruiseSeconds: 1800 },
    }),
  );
  writeFile(root, "STOP.harvester", "");

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/state`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.buckets["2-contested"]));
    assert.equal(body.buckets["2-contested"][0].id, "idea-0001");
    assert.equal(body.buckets["2-contested"][0].title, "Test idea");
    assert.deepEqual(body.buckets["2-contested"][0].tags, ["alpha", "beta"]);
    assert.deepEqual(body.buckets["1-scored"], []);

    assert.deepEqual(body.stop, ["STOP.harvester"]);
    assert.ok("harvester" in body.caps);
    assert.equal(typeof body.tmux.state, "string");
    assert.ok("harvester" in body.agentLogs);
    assert.ok(!("cliVersion" in body.agentLogs));
  });
});

test("/api/idea/<id> returns raw markdown and parsed front matter", async () => {
  const root = tmpRoot();
  writeFile(root, "ideas-2-contested/idea-0001-test.md", ideaFixture());

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/idea/idea-0001`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.bucket, "2-contested");
    assert.equal(body.fm.title, "Test idea");
    assert.deepEqual(body.fm.tags, ["alpha", "beta"]);
    assert.deepEqual(body.fm["score-breakdown"], {
      pain: 4,
      wtp: 3,
      inbound: 2,
      build: 4,
      cogs: 4,
      density: 3,
      risk: 3,
    });
    assert.deepEqual(body.fm.sources, ["https://example.com/one", "https://example.com/two"]);
    assert.match(body.body, /A test idea body paragraph/);
    assert.match(body.raw, /^---\nid: idea-0001/);

    const missing = await fetch(`${base}/api/idea/idea-9999`);
    assert.equal(missing.status, 404);
  });
});

test("/api/agent/<name> reports today's wakes, spend, err tail and the caps row", async () => {
  const root = tmpRoot();
  writeFile(
    root,
    "caps.json",
    JSON.stringify({
      cliVersion: "1.0.0",
      scorer: { dailyUsd: 5, wakeUsd: 0.75, dailyWakes: 60, sprintSeconds: 120, cruiseSeconds: 600 },
    }),
  );
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    JSON.stringify({ loggedAt: `${today}T00:00:00Z`, total_cost_usd: 0.5, num_turns: 3, subtype: "success" }),
    JSON.stringify({ loggedAt: "2020-01-01T00:00:00Z", total_cost_usd: 9, num_turns: 1, subtype: "success" }),
  ];
  writeFile(root, "logs/scorer.jsonl", `${lines.join("\n")}\n`);
  writeFile(root, "logs/scorer.err", "line one\nline two\n");

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/agent/scorer`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.log.length, 2);
    assert.equal(body.wakesToday, 1);
    assert.equal(body.costToday, 0.5);
    assert.deepEqual(body.errTail, ["line one", "line two"]);
    assert.equal(body.caps.dailyUsd, 5);
  });
});

test("/api/mail reports last blocks and unread counts from cursors", async () => {
  const root = tmpRoot();
  writeFile(
    root,
    "mail/scorer/harvester.md",
    "--- from: harvester  at: 2026-08-01T00:00:00Z  hops: 0 ---\nfirst\n\n" +
      "--- from: harvester  at: 2026-08-02T00:00:00Z  hops: 0 ---\nsecond\n\n",
  );
  writeFile(root, "mail/scorer/.cursor-harvester", "2026-08-01T00:00:00Z\n");

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/mail`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.mail.scorer.harvester.unread, 1);
    assert.equal(body.mail.scorer.harvester.last.length, 2);
    assert.equal(body.mail.scorer.harvester.last[1].body, "second");
    assert.equal(body.mail.scorer.harvester.last[1].from, "harvester");
  });
});

test("/api/artifact serves RANKED.md, THEMES.md and named plans/digests files, and refuses a path outside those roots", async () => {
  const root = tmpRoot();
  writeFile(root, "RANKED.md", "# ranked\n");
  writeFile(root, "THEMES.md", "# themes\n");
  writeFile(root, "plans/PLAN_idea-0001.md", "# plan\n");
  writeFile(root, "digests/DIGEST_2026-08-01.md", "# digest\n");
  writeFile(root, "SECRET.md", "do not serve\n");

  await withServer(root, async ({ base, port }) => {
    const ranked = await fetch(`${base}/api/artifact/RANKED.md`);
    assert.equal(ranked.status, 200);
    assert.match(await ranked.text(), /# ranked/);

    const themes = await fetch(`${base}/api/artifact/THEMES.md`);
    assert.equal(themes.status, 200);

    const plan = await fetch(`${base}/api/artifact/plans%2FPLAN_idea-0001.md`);
    assert.equal(plan.status, 200);
    assert.match(await plan.text(), /# plan/);

    const digest = await fetch(`${base}/api/artifact/digests%2FDIGEST_2026-08-01.md`);
    assert.equal(digest.status, 200);

    const rootFile = await fetch(`${base}/api/artifact/SECRET.md`);
    assert.equal(rootFile.status, 404);

    const rawTraversal = await rawGet(port, "/api/artifact/plans/../SECRET.md");
    assert.equal(rawTraversal.status, 404);
    assert.doesNotMatch(rawTraversal.body, /do not serve/);

    const encodedTraversal = await rawGet(port, "/api/artifact/plans%2F..%2FSECRET.md");
    assert.equal(encodedTraversal.status, 404);
    assert.doesNotMatch(encodedTraversal.body, /do not serve/);
  });
});

function initRepo(root, { remote } = {}) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  writeFile(root, "README.md", "hello\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "chore: seed fixture repo"], { cwd: root });
  if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
}

test("/api/commits parses `git log --oneline`", async () => {
  const root = tmpRoot();
  initRepo(root);

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/commits`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.commits.length, 1);
    assert.match(body.commits[0].subject, /seed fixture repo/);
    assert.match(body.commits[0].hash, /^[0-9a-f]{7,}$/);
  });
});

test("/api/commits derives commitUrlTemplate: gitlab ssh remote", async () => {
  const root = tmpRoot();
  initRepo(root, { remote: "git@gitlab.com:acme/widgets.git" });

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/commits`);
    const body = await res.json();
    assert.equal(
      body.commitUrlTemplate,
      "https://gitlab.com/acme/widgets/-/commit/{hash}",
    );
  });
});

test("/api/commits derives commitUrlTemplate: github https remote", async () => {
  const root = tmpRoot();
  initRepo(root, { remote: "https://github.com/octocat/hello-world.git" });

  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/commits`);
    const body = await res.json();
    assert.equal(
      body.commitUrlTemplate,
      "https://github.com/octocat/hello-world/commit/{hash}",
    );
  });
});

test("/api/commits derives commitUrlTemplate: github ssh and gitlab https also resolve", async () => {
  const sshRoot = tmpRoot();
  initRepo(sshRoot, { remote: "git@github.com:octocat/hello-world.git" });
  await withServer(sshRoot, async ({ base }) => {
    const body = await (await fetch(`${base}/api/commits`)).json();
    assert.equal(body.commitUrlTemplate, "https://github.com/octocat/hello-world/commit/{hash}");
  });

  const httpsRoot = tmpRoot();
  initRepo(httpsRoot, { remote: "https://gitlab.com/acme/widgets.git" });
  await withServer(httpsRoot, async ({ base }) => {
    const body = await (await fetch(`${base}/api/commits`)).json();
    assert.equal(
      body.commitUrlTemplate,
      "https://gitlab.com/acme/widgets/-/commit/{hash}",
    );
  });
});

test("/api/commits: commitUrlTemplate is null with no remote and with an unknown host", async () => {
  const noRemoteRoot = tmpRoot();
  initRepo(noRemoteRoot);
  await withServer(noRemoteRoot, async ({ base }) => {
    const body = await (await fetch(`${base}/api/commits`)).json();
    assert.equal(body.commitUrlTemplate, null);
  });

  const unknownHostRoot = tmpRoot();
  initRepo(unknownHostRoot, { remote: "git@example.com:group/project.git" });
  await withServer(unknownHostRoot, async ({ base }) => {
    const body = await (await fetch(`${base}/api/commits`)).json();
    assert.equal(body.commitUrlTemplate, null);
  });
});

test("a non-GET request to a known route returns 405", async () => {
  const root = tmpRoot();
  await withServer(root, async ({ base }) => {
    const res = await fetch(`${base}/api/state`, { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET");

    const deleteIdea = await fetch(`${base}/api/idea/idea-0001`, { method: "DELETE" });
    assert.equal(deleteIdea.status, 405);
  });
});

test("a write into a watched directory yields an SSE event within the debounce window", async () => {
  const root = tmpRoot();
  writeFile(root, "ideas-1-scored/.gitkeep", "");

  await withServer(root, async ({ port }) => {
    const events = [];
    const req = http.request({ hostname: "127.0.0.1", port, path: "/events", method: "GET" }, (res) => {
      res.setEncoding("utf8");
      let buffered = "";
      res.on("data", (chunk) => {
        buffered += chunk;
        const frames = buffered.split("\n\n");
        buffered = frames.pop();
        for (const frame of frames) {
          const match = frame.match(/^data: (.+)$/m);
          if (match) events.push(JSON.parse(match[1]));
        }
      });
    });
    req.end();

    await new Promise((resolve) => setTimeout(resolve, 150));
    writeFile(root, "ideas-1-scored/idea-0002-new.md", "---\nid: idea-0002\nstatus: scored\n---\n\n# Idea\n");

    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 2000;
      const check = () => {
        if (events.some((event) => event.area === "ideas")) return resolve();
        if (Date.now() > deadline) return reject(new Error("no ideas SSE event within the debounce window"));
        setTimeout(check, 50);
      };
      check();
    });

    req.destroy();
  });
});
