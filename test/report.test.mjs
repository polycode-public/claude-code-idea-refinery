import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "report.mjs");

function tmpRefinery() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "report-test-"));
}

function run(cwd, args = []) {
  return spawnSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

function write(cwd, relPath, content) {
  const full = path.join(cwd, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writeLog(cwd, agent, entries) {
  const dir = path.join(cwd, "logs");
  fs.mkdirSync(dir, { recursive: true });
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  fs.writeFileSync(path.join(dir, `${agent}.jsonl`), body);
}

function ideaFile({ id, scoreBreakdown, comments }) {
  const breakdown = scoreBreakdown
    ? Object.entries(scoreBreakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";
  const front = [
    "---",
    `id: ${id}`,
    "title: Fixture idea",
    "status: scored",
    "owner: scorer",
    "created: 2026-08-01T00:00Z",
    "updated: 2026-08-01T00:00Z",
    "tags: [fixture]",
    scoreBreakdown ? `score-breakdown: {${breakdown}}` : "score-breakdown: null",
    "parent: null",
    "merged-into: null",
    "sources: []",
    "hops: 0",
    "---",
    "",
  ].join("\n");

  const body = ["# Idea", "", "A fixture pitch.", "", "## Comments", "", comments || ""].join("\n");
  return front + body;
}

// ---- fixture refinery used by the byte-stable and survival-rate checks ----

function buildFullFixture(cwd) {
  write(
    cwd,
    "ideas-0-seeds/idea-0008.md",
    ideaFile({ id: "idea-0008", scoreBreakdown: null, comments: "" }),
  );

  write(
    cwd,
    "ideas-1-scored/idea-0005.md",
    ideaFile({
      id: "idea-0005",
      scoreBreakdown: { pain: 3, wtp: 2, inbound: 3, build: 3, cogs: 4, density: 3, risk: 3 },
      comments: "### scorer — 2026-08-10T09:00:00Z\nRubric: 58/100.\n",
    }),
  );

  write(
    cwd,
    "ideas-2-contested/idea-0004.md",
    ideaFile({
      id: "idea-0004",
      scoreBreakdown: { pain: 5, wtp: 3, inbound: 4, build: 4, cogs: 5, density: 3, risk: 3 },
      comments:
        "### scorer — 2026-08-10T09:00:00Z\nRubric: 78/100.\n\n### challenger — 2026-08-10T10:00:00Z\nThree holes.\n",
    }),
  );

  write(
    cwd,
    "ideas-3-refined/idea-0010.md",
    ideaFile({
      id: "idea-0010",
      scoreBreakdown: { pain: 4, wtp: 4, inbound: 4, build: 4, cogs: 4, density: 4, risk: 4 },
      comments:
        "### scorer — 2026-08-11T09:00:00Z\nRubric: 80/100.\n\n### challenger — 2026-08-11T10:00:00Z\nResolved.\n\n### refiner — 2026-08-11T11:00:00Z\nRewritten.\n",
    }),
  );

  write(
    cwd,
    "ideas-4-ranked/idea-0011.md",
    ideaFile({
      id: "idea-0011",
      scoreBreakdown: { pain: 5, wtp: 5, inbound: 4, build: 4, cogs: 5, density: 4, risk: 4 },
      comments:
        "### scorer — 2026-08-12T09:00:00Z\nRubric: 88/100.\n\n### challenger — 2026-08-12T10:00:00Z\nResolved.\n\n### refiner — 2026-08-12T11:00:00Z\nRewritten.\n",
    }),
  );

  // Text-parseable kill: the final scorer comment names low axis scores
  // inline ("Pain (1)", "WTP (2)", ...), which is what real scorer prose
  // does — the text path should win over the header breakdown.
  write(
    cwd,
    "ideas-killed/idea-0020.md",
    ideaFile({
      id: "idea-0020",
      scoreBreakdown: { pain: 1, wtp: 2, inbound: 3, build: 4, cogs: 4, density: 2, risk: 2 },
      comments:
        "### scorer — 2026-08-13T09:00:00Z\n" +
        "Rubric: 32/100. Pain (1): no evidence of real pain. WTP (2): unclear " +
        "willingness to pay. Inbound (3): plausible channel. Build (4): " +
        "straightforward. COGS (4): cheap. Density (2): crowded market. " +
        "Risk (2): high regulatory risk. Below 40, killing.\n",
    }),
  );

  // Fallback kill: the comment names no digits at all, so the parser must
  // fall back to the header score-breakdown (build and cogs are weak).
  write(
    cwd,
    "ideas-killed/idea-0021.md",
    ideaFile({
      id: "idea-0021",
      scoreBreakdown: { pain: 4, wtp: 4, inbound: 4, build: 1, cogs: 2, density: 4, risk: 4 },
      comments:
        "### scorer — 2026-08-14T09:00:00Z\n" +
        "Rubric: 28/100. Weak buildability and thin margins; the product is " +
        "not realistically buildable solo and COGS estimates run high. " +
        "Below 40, killing.\n",
    }),
  );

  // Archived split parent: no scorer/challenger stage is implied by the
  // bucket alone, but the challenger comment left behind proves it reached
  // "contested" before it was split.
  write(
    cwd,
    "ideas-archive/idea-0030.md",
    ideaFile({
      id: "idea-0030",
      scoreBreakdown: null,
      comments:
        "### challenger — 2026-08-09T09:00:00Z\nTwo value propositions here.\n",
    }),
  );

  writeLog(cwd, "scorer", [
    { total_cost_usd: 0.5, loggedAt: "2026-08-21T09:00:00Z" },
    { total_cost_usd: 0.25, loggedAt: "2026-08-21T10:00:00Z" },
    { total_cost_usd: 1.0, loggedAt: "2026-08-20T09:00:00Z" },
  ]);
  writeLog(cwd, "challenger", [{ total_cost_usd: 2.0, loggedAt: "2026-08-21T11:00:00Z" }]);

  write(
    cwd,
    "mail/challenger/refiner.md",
    "--- from: refiner  at: 2026-08-10T09:00:00Z  hops: 5 ---\nThoughts.\n\n" +
      "--- from: refiner  at: 2026-08-10T10:00:00Z  hops: 13 ---\nStill going.\n\n",
  );
  write(
    cwd,
    "mail/overseer/challenger.md",
    "--- from: challenger  at: 2026-08-10T09:00:00Z  hops: 12 ---\nEscalating.\n\n",
  );
  write(
    cwd,
    "mail/refiner/challenger.md",
    "--- from: challenger  at: 2026-08-10T09:00:00Z  hops: 5 ---\nReply.\n\n",
  );
  write(
    cwd,
    "mail/scorer/harvester.md",
    "--- from: harvester  at: 2026-08-10T09:00:00Z  hops: 0 ---\nSeeded idea-0008.\n\n" +
      "--- from: harvester  at: 2026-08-10T10:00:00Z  hops: 1 ---\nSeeded idea-0005.\n\n",
  );
}

const EXPECTED_REPORT = `# Refinery report — 2026-08-21 (UTC)

## Agents

| agent | wakes today | cost today | wakes all-time | cost all-time | commits |
|---|---|---|---|---|---|
| challenger | 1 | $2.0000 | 1 | $2.0000 | 0 |
| scorer | 2 | $0.7500 | 3 | $1.7500 | 0 |

## Spend per ranked idea

Total spend $3.7500 across 1 ranked idea — $3.7500 per idea.

## Buckets

| bucket | count |
|---|---|
| 0-seeds | 1 |
| 1-scored | 1 |
| 2-contested | 1 |
| 3-refined | 1 |
| 4-ranked | 1 |
| killed | 2 |
| archive | 1 |

## Survival rates

Total ideas ever seeded: 8

| stage | reached | rate |
|---|---|---|
| scored | 7 | 88% |
| contested | 4 | 50% |
| refined | 2 | 25% |
| ranked | 1 | 13% |

## Kill reasons by axis

Ideas killed: 2

| axis | count |
|---|---|
| pain | 1 |
| wtp | 1 |
| inbound | 0 |
| build | 1 |
| cogs | 1 |
| density | 1 |
| risk | 1 |

## Funnel warnings

No THEMES.md yet.

## Mail

| recipient | sender | messages |
|---|---|---|
| challenger | refiner | 2 |
| overseer | challenger | 1 |
| refiner | challenger | 1 |
| scorer | harvester | 2 |

Blocks at hops >= 12: 2
`;

test("produces a byte-stable report from a fixture refinery (no git repo present)", () => {
  const cwd = tmpRefinery();
  buildFullFixture(cwd);

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, EXPECTED_REPORT);
});

test("survival rates match hand-computed values", () => {
  const cwd = tmpRefinery();
  buildFullFixture(cwd);

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);

  // 8 ideas total: only idea-0008 (0-seeds, no comments) never reached
  // "scored" -> 7/8 = 88%. idea-0004, idea-0010, idea-0011 and the
  // archived idea-0030 (challenger comment) reached "contested" -> 4/8 =
  // 50%. idea-0010 and idea-0011 reached "refined" -> 2/8 = 25%. Only
  // idea-0011 sits in 4-ranked -> 1/8 = 13%.
  assert.match(result.stdout, /\| scored \| 7 \| 88% \|/);
  assert.match(result.stdout, /\| contested \| 4 \| 50% \|/);
  assert.match(result.stdout, /\| refined \| 2 \| 25% \|/);
  assert.match(result.stdout, /\| ranked \| 1 \| 13% \|/);
});

test("kill reasons prefer the comment's inline scores and fall back to score-breakdown", () => {
  const cwd = tmpRefinery();
  buildFullFixture(cwd);

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);

  // idea-0020's comment names pain/wtp/density/risk inline; idea-0021's
  // comment names no digits at all, so build/cogs come from its header
  // score-breakdown instead.
  assert.match(result.stdout, /\| pain \| 1 \|/);
  assert.match(result.stdout, /\| wtp \| 1 \|/);
  assert.match(result.stdout, /\| inbound \| 0 \|/);
  assert.match(result.stdout, /\| build \| 1 \|/);
  assert.match(result.stdout, /\| cogs \| 1 \|/);
  assert.match(result.stdout, /\| density \| 1 \|/);
  assert.match(result.stdout, /\| risk \| 1 \|/);
});

test("renders a plain line when ideas-4-ranked is empty", () => {
  const cwd = tmpRefinery();
  write(
    cwd,
    "ideas-1-scored/idea-0001.md",
    ideaFile({ id: "idea-0001", scoreBreakdown: { pain: 3, wtp: 3, inbound: 3, build: 3, cogs: 3, density: 3, risk: 3 }, comments: "" }),
  );

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Spend per ranked idea\n\nNo idea has ranked yet\.\n/);
  assert.doesNotMatch(result.stdout, /per idea\./);
});

test("--date pins the today window for wakes and cost", () => {
  const cwd = tmpRefinery();
  writeLog(cwd, "scorer", [
    { total_cost_usd: 1.0, loggedAt: "2026-08-21T09:00:00Z" },
    { total_cost_usd: 5.0, loggedAt: "2026-08-20T09:00:00Z" },
  ]);

  const pinnedToday = run(cwd, ["--date", "2026-08-21"]);
  assert.match(pinnedToday.stdout, /\| scorer \| 1 \| \$1\.0000 \| 2 \| \$6\.0000 \| 0 \|/);

  const pinnedYesterday = run(cwd, ["--date", "2026-08-20"]);
  assert.match(pinnedYesterday.stdout, /\| scorer \| 1 \| \$5\.0000 \| 2 \| \$6\.0000 \| 0 \|/);
});

test("no THEMES.md is distinguished from an empty warnings section, and warnings are sorted", () => {
  const cwd = tmpRefinery();
  write(
    cwd,
    "THEMES.md",
    [
      "# Themes — 2026-08-21",
      "",
      "Funnel warning: dev-tools exceeds 40% of live ideas.",
      "Funnel warning: api-monetisation exceeds 40% of live ideas.",
      "",
    ].join("\n"),
  );

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);
  const section = result.stdout.split("## Funnel warnings\n\n")[1];
  const warningLines = section.split("\n").slice(0, 2);
  assert.deepEqual(warningLines, [
    "Funnel warning: api-monetisation exceeds 40% of live ideas.",
    "Funnel warning: dev-tools exceeds 40% of live ideas.",
  ]);
});

test("a THEMES.md with no funnel-warning lines renders its own plain line", () => {
  const cwd = tmpRefinery();
  write(cwd, "THEMES.md", "# Themes — 2026-08-21\n\n| theme | live ideas |\n|---|---|\n");

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.match(result.stdout, /No funnel warnings currently in THEMES\.md\./);
});

test("counts commits per agent from git log by the refinery's conventional prefix", () => {
  const cwd = tmpRefinery();
  writeLog(cwd, "scorer", [{ total_cost_usd: 0.1, loggedAt: "2026-08-21T09:00:00Z" }]);
  writeLog(cwd, "challenger", [{ total_cost_usd: 0.1, loggedAt: "2026-08-21T09:00:00Z" }]);

  const git = (args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["commit", "--allow-empty", "-q", "-m", "scorer: score idea-0005 (58)"]);
  git(["commit", "--allow-empty", "-q", "-m", "scorer: score idea-0006 (61)"]);
  git(["commit", "--allow-empty", "-q", "-m", "challenger: contest idea-0004"]);
  git(["commit", "--allow-empty", "-q", "-m", "not-an-agent: unrelated commit"]);

  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\| scorer \| 1 \| \$0\.1000 \| 1 \| \$0\.1000 \| 2 \|/);
  assert.match(result.stdout, /\| challenger \| 1 \| \$0\.1000 \| 1 \| \$0\.1000 \| 1 \|/);
});

test("no wake logs and no ideas at all renders every section's fallback line", () => {
  const cwd = tmpRefinery();
  const result = run(cwd, ["--date", "2026-08-21"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No wake logs yet\./);
  assert.match(result.stdout, /No idea has ranked yet\./);
  assert.match(result.stdout, /Total ideas ever seeded: 0/);
  assert.match(result.stdout, /No ideas have been killed yet\./);
  assert.match(result.stdout, /No THEMES\.md yet\./);
  assert.match(result.stdout, /No mail sent yet\./);
  assert.match(result.stdout, /Blocks at hops >= 12: 0/);
});
