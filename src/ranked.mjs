// Rebuilds RANKED.md deterministically from idea front matter. The table is
// mechanical; judgment about graduation stays with the ranker agent. A bucket not
// listed here (killed, archive, operator-rejected, 0-seeds) never reaches the table.
import fs from "node:fs";
import path from "node:path";
import { parseFrontMatter, fmField } from "./front-matter.mjs";

const ROOT = process.argv[2] || ".";
const OUT = process.argv[3] || "RANKED.md";
const TOP = 20;

const BUCKETS = ["1-scored", "2-contested", "3-refined", "4-ranked", "operator-selected"];

function parseIdea(file, bucket) {
  const parsed = parseFrontMatter(fs.readFileSync(file, "utf8"));
  if (!parsed) return null;
  const score = fmField(parsed.fm, "score");
  if (score === null || !/^\d+$/.test(score)) return null;
  const pitchBlock = parsed.body.split(/^# Idea\s*$/m)[1] || "";
  const para = pitchBlock.split(/\n\s*\n/).map((s) => s.trim()).find(Boolean) || "";
  const oneLiner = (para.replace(/\s+/g, " ").match(/^.*?[.!?](\s|$)/) || [para])[0].trim();
  return {
    id: fmField(parsed.fm, "id"),
    title: fmField(parsed.fm, "title") || "",
    score: Number(score),
    status: fmField(parsed.fm, "status") + (bucket === "operator-selected" ? " pinned" : ""),
    oneLiner,
  };
}

const rows = [];
for (const bucket of BUCKETS) {
  const dir = path.join(ROOT, `ideas-${bucket}`);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".md") || !name.startsWith("idea-")) continue;
    const row = parseIdea(path.join(dir, name), bucket);
    if (row) rows.push(row);
  }
}

rows.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

const stamp = new Date().toISOString().slice(0, 16) + "Z";
const lines = [
  `# RANKED.md — rebuilt ${stamp}`,
  "",
  "| rank | id | title | score | status | one-liner |",
  "|---|---|---|---|---|---|",
  ...rows.slice(0, TOP).map((r, i) =>
    `| ${i + 1} | ${r.id} | ${r.title.replace(/\|/g, "/")} | ${r.score} | ${r.status} | ${r.oneLiner.replace(/\|/g, "/")} |`
  ),
  "",
];
fs.writeFileSync(OUT, lines.join("\n"));
console.log(`ranked: ${Math.min(rows.length, TOP)} rows of ${rows.length} scored ideas`);
