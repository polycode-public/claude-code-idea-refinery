import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(TEST_DIR, "..", "src", "themes.mjs");
const EMBED_SCRIPT = path.join(TEST_DIR, "..", "src", "embed.mjs");
const PITCHES = JSON.parse(fs.readFileSync(path.join(TEST_DIR, "fixtures", "pitches.json"), "utf8"));

// Pitches 0/1 and 2/3 are the fixture's near-duplicate pairs (see
// test/fixtures/pitches.json). The rest are distinct businesses.
const TAGS = [
  ["food", "subscription"],
  ["food", "subscription", "spice"],
  ["marketplace", "welding"],
  ["marketplace", "welding", "repair"],
  ["mobility", "app"],
  ["saas", "cloud"],
  ["concierge", "cards"],
  ["marketplace", "parking"],
  ["browser-extension", "furniture"],
];

const DEFAULT_BUCKETS = PITCHES.map((_, i) => (i < 5 ? "0-seeds" : "1-scored"));
// Same ideas, spread across every live bucket in a different pattern, to
// prove the report doesn't depend on which bucket an idea sits in.
const SHUFFLED_BUCKETS = [
  "3-refined",
  "0-seeds",
  "4-ranked",
  "1-scored",
  "2-contested",
  "0-seeds",
  "3-refined",
  "1-scored",
  "4-ranked",
];

function ideaBody(id, pitch, tags) {
  return [
    "---",
    `id: ${id}`,
    `title: Test idea ${id}`,
    "status: seeded",
    "owner: harvester",
    "created: 2026-08-21T09:00Z",
    "updated: 2026-08-21T09:00Z",
    `tags: [${tags.join(", ")}]`,
    "score: null",
    "parent: null",
    "merged-into: null",
    "sources: []",
    "hops: 0",
    "---",
    "",
    "# Idea",
    pitch,
    "",
    "## Model",
    "Filler model text.",
    "",
    "## Comments",
    "",
  ].join("\n");
}

function tmpCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "themes-test-"));
}

// Writes the fixture pitches as idea docs, one per entry in bucketFor
// (parallel to PITCHES), plus a killed idea that must never surface.
function writeFixtureTree(cwd, bucketFor) {
  for (const bucket of new Set(bucketFor)) {
    fs.mkdirSync(path.join(cwd, `ideas-${bucket}`), { recursive: true });
  }
  fs.mkdirSync(path.join(cwd, "ideas-killed"), { recursive: true });

  PITCHES.forEach((pitch, i) => {
    const id = `idea-${String(i + 1).padStart(4, "0")}`;
    fs.writeFileSync(path.join(cwd, `ideas-${bucketFor[i]}`, `${id}.md`), ideaBody(id, pitch, TAGS[i]));
  });

  fs.writeFileSync(
    path.join(cwd, "ideas-killed", "idea-9999.md"),
    ideaBody("idea-9999", "A killed idea that must never appear in the report.", ["dead"]),
  );
}

function runThemes(cwd) {
  const result = spawnSync("node", [SCRIPT, "--stub"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function round(value, places) {
  return Number(value.toFixed(places));
}

test("the report is byte-identical across reruns and across bucket placement", () => {
  const cwdA = tmpCwd();
  writeFixtureTree(cwdA, DEFAULT_BUCKETS);
  const resultA = spawnSync("node", [SCRIPT, "--stub"], { cwd: cwdA, encoding: "utf8" });
  assert.equal(resultA.status, 0, resultA.stderr);

  const cwdB = tmpCwd();
  writeFixtureTree(cwdB, SHUFFLED_BUCKETS);
  const resultB = spawnSync("node", [SCRIPT, "--stub"], { cwd: cwdB, encoding: "utf8" });
  assert.equal(resultB.status, 0, resultB.stderr);

  assert.equal(resultA.stdout, resultB.stdout);

  const rerun = spawnSync("node", [SCRIPT, "--stub"], { cwd: cwdA, encoding: "utf8" });
  assert.equal(rerun.stdout, resultA.stdout);
});

test("a known-similar pair lands in the same cluster", () => {
  const cwd = tmpCwd();
  writeFixtureTree(cwd, DEFAULT_BUCKETS);
  const report = runThemes(cwd);

  const clusterOf = (id) => report.clusters.find((c) => c.members.includes(id));
  const clusterA = clusterOf("idea-0001");
  const clusterB = clusterOf("idea-0002");

  assert.ok(clusterA, "idea-0001 should be in some cluster");
  assert.deepEqual(clusterA, clusterB);
});

test("killed and archive buckets are skipped", () => {
  const cwd = tmpCwd();
  writeFixtureTree(cwd, DEFAULT_BUCKETS);
  const report = runThemes(cwd);

  const allMembers = report.clusters.flatMap((c) => c.members);
  assert.ok(!allMembers.includes("idea-9999"));
});

test("cluster shares sum to 100 across the report", () => {
  const cwd = tmpCwd();
  writeFixtureTree(cwd, DEFAULT_BUCKETS);
  const report = runThemes(cwd);

  const total = report.clusters.reduce((sum, c) => sum + c.sharePercent, 0);
  assert.equal(total, 100);
});

test("pair cosine and tag jaccard match hand-computed values", () => {
  const cwd = tmpCwd();
  writeFixtureTree(cwd, DEFAULT_BUCKETS);
  const report = runThemes(cwd);

  const pair = report.pairs.find((p) => p.a === "idea-0001" && p.b === "idea-0002");
  assert.ok(pair, "expected idea-0001/idea-0002 to be reported as a close pair");

  // Hand-computed tag Jaccard: {food, subscription} vs {food, subscription, spice}.
  assert.equal(pair.jaccard, round(2 / 3, 4));

  // Hand-computed cosine: re-embed the same two pitches directly through
  // embed.mjs --stub and compute cosine similarity independently, rather
  // than trusting themes.mjs's own clustering code to grade itself.
  const embedResult = spawnSync("node", [EMBED_SCRIPT, "--stub"], {
    input: JSON.stringify([PITCHES[0], PITCHES[1]]),
    encoding: "utf8",
  });
  assert.equal(embedResult.status, 0, embedResult.stderr);
  const [vecA, vecB] = JSON.parse(embedResult.stdout);

  const dot = vecA.reduce((sum, v, i) => sum + v * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(vecB.reduce((sum, v) => sum + v * v, 0));
  const expectedCosine = round(dot / (normA * normB), 4);

  assert.equal(pair.cosine, expectedCosine);
});
