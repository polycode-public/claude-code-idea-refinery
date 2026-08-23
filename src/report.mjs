#!/usr/bin/env node
// src/report.mjs — the refinery's measured-run report.
//
// Reads logs/<agent>.jsonl (stamped claude -p results), `git log` (read
// only), the ideas-* buckets, THEMES.md and mail/, and prints a plain-text
// report to stdout: per-agent wakes and spend, spend per ranked idea,
// bucket counts and survival rates, kill reasons by rubric axis, funnel
// warnings, and mail volume plus hop escalations.
//
// Deterministic given the same files. Every table is sorted, and the only
// wall-clock read is the header's date line and the "today" cutoff for the
// per-agent wake/cost columns. Both are driven by one `--date YYYY-MM-DD`
// override so tests can pin them.
//
// Usage: report.mjs [--date YYYY-MM-DD]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { parseFrontMatter, fmField } from "./front-matter.mjs";

const CWD = process.cwd();
const LOGS_DIR = path.resolve(CWD, "logs");
const MAIL_ROOT = path.resolve(CWD, "mail");
const THEMES_FILE = path.resolve(CWD, "THEMES.md");

const BUCKETS = [
  "0-seeds",
  "1-scored",
  "2-contested",
  "3-refined",
  "4-ranked",
  "killed",
  "archive",
];

// Rubric axis keys, in the rubric skill's table order. Real scorer comments
// name the weak axis inline as "Pain (2)", "WTP (2)", "Build (1)" and so
// on. These are the same short keys the score-breakdown header uses.
const AXES = ["pain", "wtp", "inbound", "build", "cogs", "density", "risk"];

const STAGE_INDEX = { seeded: 0, scored: 1, contested: 2, refined: 3, ranked: 4 };
const STAGE_ORDER = ["scored", "contested", "refined", "ranked"];

// A bucket implies at least this stage was reached, even with no comments
// at all. Killed only fires after the scorer evaluates an idea, and an
// archived doc was at least seeded before it was split or merged away.
const BUCKET_BASE_STAGE = {
  "0-seeds": "seeded",
  "1-scored": "scored",
  "2-contested": "contested",
  "3-refined": "refined",
  "4-ranked": "ranked",
  killed: "scored",
  archive: "seeded",
};

// A comment left by one of these roles is evidence the idea reached that
// stage at some point, regardless of where it sits now. This is what lets
// an archived split parent or a killed idea count as having reached
// "contested" if a challenger actually engaged with it.
const ROLE_STAGE = { scorer: "scored", challenger: "contested", refiner: "refined" };

const COMMENT_HEADER = /^### ([A-Za-z][\w-]*)\s+[—-]\s+(\S+)\s*$/gm;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function fmtUsd(value) {
  return `$${round4(value).toFixed(4)}`;
}

function pct(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`];
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines;
}

// ---- logs/*.jsonl -----------------------------------------------------

function loadAgentStats(today) {
  if (!fs.existsSync(LOGS_DIR)) return [];
  const agentNames = fs
    .readdirSync(LOGS_DIR)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => name.slice(0, -".jsonl".length))
    .sort();

  return agentNames.map((agent) => {
    const lines = fs
      .readFileSync(path.join(LOGS_DIR, `${agent}.jsonl`), "utf8")
      .split("\n")
      .filter(Boolean);

    let wakesToday = 0;
    let costToday = 0;
    let wakesAll = 0;
    let costAll = 0;

    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const cost = Number(entry.total_cost_usd) || 0;
      wakesAll += 1;
      costAll += cost;
      const stamp = typeof entry.loggedAt === "string" ? entry.loggedAt.slice(0, 10) : null;
      if (stamp === today) {
        wakesToday += 1;
        costToday += cost;
      }
    }

    return {
      agent,
      wakesToday,
      costToday: round4(costToday),
      wakesAll,
      costAll: round4(costAll),
    };
  });
}

// ---- git log (read-only) ----------------------------------------------

// logs/ is gitignored operational state, so it can be rotated or lost.
// git history is permanent. Counting commits by the refinery's own
// convention ("<agent>: message") gives a durable cross-check on wakes
// alongside the ephemeral log-derived counts above.
function commitCountsByAgent(agentNames) {
  const counts = new Map(agentNames.map((name) => [name, 0]));
  const result = spawnSync("git", ["log", "--pretty=format:%s"], {
    cwd: CWD,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) return counts;

  for (const subject of result.stdout.split("\n")) {
    const m = subject.match(/^([a-z][\w-]*):/);
    if (m && counts.has(m[1])) counts.set(m[1], counts.get(m[1]) + 1);
  }
  return counts;
}

// ---- ideas-* buckets ----------------------------------------------------

function parseScoreBreakdown(front) {
  const raw = fmField(front, "score-breakdown");
  if (!raw) return null;
  const breakdown = {};
  for (const m of raw.matchAll(/(\w+):\s*(\d+)/g)) breakdown[m[1]] = Number(m[2]);
  return breakdown;
}

function parseCommentBlocks(commentsText) {
  const headers = [];
  const re = new RegExp(COMMENT_HEADER);
  let m;
  while ((m = re.exec(commentsText))) {
    headers.push({ role: m[1].toLowerCase(), at: m[2], index: m.index, headerLen: m[0].length });
  }
  return headers.map((header, i) => {
    const start = header.index + header.headerLen;
    const end = i + 1 < headers.length ? headers[i + 1].index : commentsText.length;
    return { role: header.role, at: header.at, text: commentsText.slice(start, end) };
  });
}

function parseIdeaFile(bucket, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseFrontMatter(text);
  const front = parsed ? parsed.fm : "";
  const body = parsed ? parsed.body : text;
  const id = fmField(front, "id") || path.basename(filePath, ".md");

  const commentsIndex = body.search(/^## Comments/m);
  const commentsText = commentsIndex >= 0 ? body.slice(commentsIndex) : "";

  return {
    id,
    bucket,
    scoreBreakdown: parseScoreBreakdown(front),
    commentBlocks: parseCommentBlocks(commentsText),
  };
}

function loadIdeas() {
  const ideas = [];
  const counts = {};
  for (const bucket of BUCKETS) {
    const dir = path.resolve(CWD, `ideas-${bucket}`);
    counts[bucket] = 0;
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
    counts[bucket] = files.length;
    for (const file of files) ideas.push(parseIdeaFile(bucket, path.join(dir, file)));
  }
  ideas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ideas, counts };
}

function reachedStageIndex(idea) {
  let idx = STAGE_INDEX[BUCKET_BASE_STAGE[idea.bucket]] ?? 0;
  for (const block of idea.commentBlocks) {
    const stage = ROLE_STAGE[block.role];
    if (stage && STAGE_INDEX[stage] > idx) idx = STAGE_INDEX[stage];
  }
  return idx;
}

function survivalRates(ideas) {
  const total = ideas.length;
  return STAGE_ORDER.map((stage) => {
    const reached = ideas.filter((idea) => reachedStageIndex(idea) >= STAGE_INDEX[stage]).length;
    return { stage, reached, rate: pct(reached, total) };
  });
}

// ---- kill reasons by rubric axis ---------------------------------------

function lastBlockByRole(blocks, role) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].role === role) return blocks[i];
  }
  return null;
}

// Looks for "<axis> (<digit>)" in the final scorer comment, the shape real
// scorer prose uses ("Pain (2):", "WTP (1):"). A digit of 2 or below marks
// that axis as a reason for the kill. Falls back to the header's
// score-breakdown when the comment's prose doesn't parse.
function failingAxesFromText(text) {
  const failing = [];
  for (const axis of AXES) {
    const m = text.match(new RegExp(`\\b${axis}\\b\\s*\\(\\s*(\\d)\\s*\\)`, "i"));
    if (m && Number(m[1]) <= 2) failing.push(axis);
  }
  return failing;
}

function failingAxesForKilledIdea(idea) {
  const lastScore = lastBlockByRole(idea.commentBlocks, "scorer");
  if (lastScore) {
    const fromText = failingAxesFromText(lastScore.text);
    if (fromText.length) return fromText;
  }
  if (idea.scoreBreakdown) {
    return AXES.filter(
      (axis) => idea.scoreBreakdown[axis] !== undefined && idea.scoreBreakdown[axis] <= 2,
    );
  }
  return [];
}

function killReasonCounts(killedIdeas) {
  const counts = Object.fromEntries(AXES.map((axis) => [axis, 0]));
  for (const idea of killedIdeas) {
    for (const axis of failingAxesForKilledIdea(idea)) counts[axis] += 1;
  }
  return counts;
}

// ---- THEMES.md funnel warnings -----------------------------------------

function funnelWarnings() {
  if (!fs.existsSync(THEMES_FILE)) return null;
  const text = fs.readFileSync(THEMES_FILE, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Funnel warning:"))
    .sort();
}

// ---- mail volume ---------------------------------------------------------

function parseMailBlockHops(text) {
  const hops = [];
  const re = /^--- (.+) ---\s*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const hopsMatch = m[1].match(/hops:\s*(\d+)/);
    hops.push(hopsMatch ? Number(hopsMatch[1]) : 0);
  }
  return hops;
}

function mailStats() {
  const rows = [];
  let highHops = 0;
  if (!fs.existsSync(MAIL_ROOT)) return { rows, highHops };

  const recipients = fs
    .readdirSync(MAIL_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const recipient of recipients) {
    const dir = path.join(MAIL_ROOT, recipient);
    const senderFiles = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const file of senderFiles) {
      const sender = file.slice(0, -3);
      const hops = parseMailBlockHops(fs.readFileSync(path.join(dir, file), "utf8"));
      rows.push({ recipient, sender, count: hops.length });
      highHops += hops.filter((h) => h >= 12).length;
    }
  }

  return { rows, highHops };
}

// ---- report assembly ----------------------------------------------------

function buildReport(date) {
  const lines = [];
  lines.push(`# Refinery report — ${date} (UTC)`, "");

  const agentStats = loadAgentStats(date);
  const commits = commitCountsByAgent(agentStats.map((a) => a.agent));

  lines.push("## Agents", "");
  if (agentStats.length === 0) {
    lines.push("No wake logs yet.");
  } else {
    lines.push(
      ...table(
        ["agent", "wakes today", "cost today", "wakes all-time", "cost all-time", "commits"],
        agentStats.map((a) => [
          a.agent,
          String(a.wakesToday),
          fmtUsd(a.costToday),
          String(a.wakesAll),
          fmtUsd(a.costAll),
          String(commits.get(a.agent) ?? 0),
        ]),
      ),
    );
  }
  lines.push("");

  const { ideas, counts } = loadIdeas();
  const rankedCount = counts["4-ranked"];
  const grandTotalCost = round4(agentStats.reduce((sum, a) => sum + a.costAll, 0));

  lines.push("## Spend per ranked idea", "");
  if (rankedCount === 0) {
    lines.push("No idea has ranked yet.");
  } else {
    lines.push(
      `Total spend ${fmtUsd(grandTotalCost)} across ${rankedCount} ranked idea${rankedCount === 1 ? "" : "s"} — ${fmtUsd(grandTotalCost / rankedCount)} per idea.`,
    );
  }
  lines.push("");

  lines.push("## Buckets", "");
  lines.push(...table(["bucket", "count"], BUCKETS.map((bucket) => [bucket, String(counts[bucket])])));
  lines.push("");

  lines.push("## Survival rates", "");
  lines.push(`Total ideas ever seeded: ${ideas.length}`, "");
  lines.push(
    ...table(
      ["stage", "reached", "rate"],
      survivalRates(ideas).map((row) => [row.stage, String(row.reached), `${row.rate}%`]),
    ),
  );
  lines.push("");

  const killedIdeas = ideas.filter((idea) => idea.bucket === "killed");
  lines.push("## Kill reasons by axis", "");
  if (killedIdeas.length === 0) {
    lines.push("No ideas have been killed yet.");
  } else {
    const counts2 = killReasonCounts(killedIdeas);
    const total = AXES.reduce((sum, axis) => sum + counts2[axis], 0);
    lines.push(`Ideas killed: ${killedIdeas.length}`, "");
    if (total === 0) {
      lines.push("No failing axes could be parsed from the killed ideas' comments.");
    } else {
      lines.push(...table(["axis", "count"], AXES.map((axis) => [axis, String(counts2[axis])])));
    }
  }
  lines.push("");

  lines.push("## Funnel warnings", "");
  const warnings = funnelWarnings();
  if (warnings === null) {
    lines.push("No THEMES.md yet.");
  } else if (warnings.length === 0) {
    lines.push("No funnel warnings currently in THEMES.md.");
  } else {
    lines.push(...warnings);
  }
  lines.push("");

  const { rows: mailRows, highHops } = mailStats();
  lines.push("## Mail", "");
  if (mailRows.length === 0) {
    lines.push("No mail sent yet.");
  } else {
    lines.push(
      ...table(
        ["recipient", "sender", "messages"],
        mailRows.map((row) => [row.recipient, row.sender, String(row.count)]),
      ),
    );
  }
  lines.push("", `Blocks at hops >= 12: ${highHops}`);

  return `${lines.join("\n")}\n`;
}

function main() {
  const { values: { date } } = parseArgs({
    args: process.argv.slice(2),
    options: { date: { type: "string" } },
  });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("--date expects YYYY-MM-DD");
  process.stdout.write(buildReport(date ?? todayUtc()));
}

main();
