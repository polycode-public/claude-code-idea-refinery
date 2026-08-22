#!/usr/bin/env node
// src/themes.mjs — clusters live ideas by pitch similarity.
//
// Scans every idea markdown file in the live buckets (skipping ideas-killed
// and ideas-archive), embeds each idea's pitch paragraph via embed.mjs, clusters the
// pitches with agglomerative clustering over cosine distance, and prints a
// JSON report: clusters (member ids and share of live ideas) plus every
// pair of ideas whose pitch cosine exceeds PAIR_COSINE_THRESHOLD, with
// their tag Jaccard. All agent-facing judgment (naming a cluster, deciding
// what to do about a warning) stays with the tagger and merger agents —
// this script only measures.
//
// Usage: themes.mjs [--stub]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrontMatter, fmField, fmTags } from "./front-matter.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EMBED_SCRIPT = path.join(SCRIPT_DIR, "embed.mjs");
const LIVE_BUCKETS = [
  "0-seeds",
  "1-scored",
  "2-contested",
  "3-refined",
  "4-ranked",
  "operator-selected",
];

// Agglomerative merge stops once the closest pair of clusters is farther
// apart than this (average-linkage cosine distance = 1 - cosine).
const CLUSTER_DISTANCE_THRESHOLD = 0.35;

// A pair is reported regardless of cluster membership once its pitches are
// at least this similar.
const PAIR_COSINE_THRESHOLD = 0.8;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// The pitch is the first paragraph under the "# Idea" heading: everything
// from the line after the heading up to the next blank line or heading.
function extractPitch(body) {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() !== "# Idea") i++;
  if (i >= lines.length) return null;
  i++;
  while (i < lines.length && lines[i].trim() === "") i++;

  const paragraph = [];
  while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#")) {
    paragraph.push(lines[i].trim());
    i++;
  }
  const pitch = paragraph.join(" ").trim();
  return pitch.length ? pitch : null;
}

function parseIdeaFile(text) {
  const parsed = parseFrontMatter(text);
  if (!parsed) return null;

  const id = fmField(parsed.fm, "id");
  const pitch = extractPitch(parsed.body);
  if (!id || !pitch) return null;

  return { id, tags: fmTags(parsed.fm), pitch };
}

function loadLiveIdeas() {
  const ideas = [];
  for (const bucket of LIVE_BUCKETS) {
    const dir = path.resolve(process.cwd(), `ideas-${bucket}`);
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const file of files) {
      const parsed = parseIdeaFile(fs.readFileSync(path.join(dir, file), "utf8"));
      if (parsed) ideas.push(parsed);
    }
  }
  return ideas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function embedPitches(pitches, stub) {
  const args = [EMBED_SCRIPT];
  if (stub) args.push("--stub");
  const result = spawnSync(process.execPath, args, {
    input: JSON.stringify(pitches),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`themes.mjs: embed.mjs failed: ${(result.stderr || "").trim()}`);
  }
  return JSON.parse(result.stdout);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tagJaccard(tagsA, tagsB) {
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  let intersectionSize = 0;
  for (const tag of setA) if (setB.has(tag)) intersectionSize++;
  return intersectionSize / union.size;
}

// Average-linkage agglomerative clustering. Clusters start sorted by id and
// every merge step picks the globally closest pair, breaking exact ties on
// the pair's sorted member ids — so the result depends only on the id/vector
// pairing, never on the order ideas were read from disk.
function clusterIds(ids, vectorById) {
  function linkageDistance(clusterA, clusterB) {
    let total = 0;
    for (const a of clusterA) {
      for (const b of clusterB) {
        total += 1 - cosineSimilarity(vectorById.get(a), vectorById.get(b));
      }
    }
    return total / (clusterA.length * clusterB.length);
  }

  function pairKey(clusterA, clusterB) {
    return JSON.stringify([clusterA.slice().sort(), clusterB.slice().sort()].sort());
  }

  let clusters = ids
    .slice()
    .sort()
    .map((id) => [id]);

  while (clusters.length > 1) {
    let bestDistance = Infinity;
    let bestKey = null;
    let bestPair = null;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const distance = linkageDistance(clusters[i], clusters[j]);
        const key = pairKey(clusters[i], clusters[j]);
        if (distance < bestDistance || (distance === bestDistance && key < bestKey)) {
          bestDistance = distance;
          bestKey = key;
          bestPair = [i, j];
        }
      }
    }

    if (bestDistance > CLUSTER_DISTANCE_THRESHOLD) break;

    const [i, j] = bestPair;
    const merged = [...clusters[i], ...clusters[j]].sort();
    clusters = clusters.filter((_, idx) => idx !== i && idx !== j);
    clusters.push(merged);
  }

  return clusters.map((members) => members.slice().sort());
}

// Integer percentages that sum to exactly 100: floor every share, then hand
// the remaining points to the clusters with the largest fractional part
// (ties broken by cluster order, which is already deterministic).
function sharePercentages(sizes, total) {
  const raw = sizes.map((size) => (size / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, x) => sum + x, 0);

  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const shares = floors.slice();
  for (let k = 0; k < remainder; k++) shares[byFraction[k].index] += 1;
  return shares;
}

function round(value, places) {
  return Number(value.toFixed(places));
}

function buildReport(ideas, vectors) {
  const vectorById = new Map(ideas.map((idea, index) => [idea.id, vectors[index]]));
  const tagsById = new Map(ideas.map((idea) => [idea.id, idea.tags]));
  const ids = ideas.map((idea) => idea.id);

  const clusters = clusterIds(ids, vectorById);
  const shares = sharePercentages(
    clusters.map((members) => members.length),
    ids.length,
  );
  const clusterReport = clusters
    .map((members, index) => ({ members, sharePercent: shares[index] }))
    .sort((a, b) => (a.members[0] < b.members[0] ? -1 : 1));

  const sortedIds = ids.slice().sort();
  const pairs = [];
  for (let i = 0; i < sortedIds.length; i++) {
    for (let j = i + 1; j < sortedIds.length; j++) {
      const a = sortedIds[i];
      const b = sortedIds[j];
      const cosine = cosineSimilarity(vectorById.get(a), vectorById.get(b));
      if (cosine > PAIR_COSINE_THRESHOLD) {
        pairs.push({
          a,
          b,
          cosine: round(cosine, 4),
          jaccard: round(tagJaccard(tagsById.get(a), tagsById.get(b)), 4),
        });
      }
    }
  }

  return { clusters: clusterReport, pairs };
}

function main() {
  const stub = process.argv.includes("--stub");
  const ideas = loadLiveIdeas();

  if (ideas.length === 0) {
    console.log(JSON.stringify({ clusters: [], pairs: [] }, null, 2));
    return;
  }

  const vectors = embedPitches(
    ideas.map((idea) => idea.pitch),
    stub,
  );
  console.log(JSON.stringify(buildReport(ideas, vectors), null, 2));
}

main();
