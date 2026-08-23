#!/usr/bin/env node
// src/retrieve.mjs "query" [-k 8] [--scope docs|ideas|all] [--stub]
//
// Hybrid retrieval over index/refinery.db: a vector leg (vec0 nearest
// neighbours over the embedded query) and a lexical leg (FTS5 BM25),
// fused by reciprocal rank fusion. Prints the top k results as chunk id
// then chunk text, blank-line separated.
//
// --scope filters both legs by the docs.source column before fusion.
// Default is docs, so citation paths (which read docs/<id> chunk ids) are
// untouched unless a caller opts into the idea corpus.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { load as loadVecExtension } from "sqlite-vec";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EMBED_SCRIPT = path.join(SCRIPT_DIR, "embed.mjs");

const RRF_K = 60;
const DEFAULT_TOP_K = 8;
const DEFAULT_SCOPE = "docs";
const SCOPE_SOURCES = {
  docs: ["docs"],
  ideas: ["ideas"],
  all: ["docs", "ideas"],
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseFlags(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        k: { type: "string", short: "k", default: String(DEFAULT_TOP_K) },
        scope: { type: "string", default: DEFAULT_SCOPE },
        stub: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
  } catch (error) {
    fail(error.message);
  }
  const { values, positionals } = parsed;
  return { query: positionals[0] || null, k: Number(values.k), scope: values.scope, stub: values.stub };
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

export function openReadonlyDb(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  loadVecExtension(db);
  return db;
}

function embedQuery(query, stub) {
  const args = [EMBED_SCRIPT];
  if (stub) args.push("--stub");
  const result = spawnSync(process.execPath, args, {
    input: JSON.stringify([query]),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`retrieve.mjs: embed.mjs failed: ${(result.stderr || "").trim()}`);
  return JSON.parse(result.stdout)[0];
}

// Loose tokenization, quoted and OR-joined, so punctuation in the query
// (or in a phrase like "usage-based") can never break FTS5's query syntax.
function ftsQuery(query) {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) || [];
  return tokens.map((token) => `"${token}"`).join(" OR ");
}

// Chunks don't carry a source of their own. It lives on the doc they
// belong to. Looked up once per leg call rather than joined into the
// vec0 KNN query itself, since vec0's MATCH+k form doesn't reliably
// compose with arbitrary extra predicates.
function sourceByDocId(db) {
  const map = new Map();
  for (const row of db.prepare("SELECT id, source FROM docs").all()) map.set(row.id, row.source);
  return map;
}

function filterByScope(rows, db, scopes) {
  if (!scopes) return rows;
  const sources = sourceByDocId(db);
  return rows.filter((row) => scopes.includes(sources.get(row.doc_id)));
}

export function vectorLeg(db, queryVector, poolSize, scopes = null) {
  if (!hasTable(db, "chunks_vec")) return [];
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.doc_id AS doc_id, v.distance AS distance
       FROM chunks_vec v JOIN chunks c ON c.rowid = v.id
       WHERE v.embedding MATCH ? AND k = ?
       ORDER BY v.distance`,
    )
    .all(JSON.stringify(queryVector), poolSize);
  return filterByScope(rows, db, scopes).map((row) => row.chunk_id);
}

export function lexicalLeg(db, query, poolSize, scopes = null) {
  if (!hasTable(db, "chunks_fts")) return [];
  const matchQuery = ftsQuery(query);
  if (!matchQuery) return [];
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.doc_id AS doc_id, bm25(chunks_fts) AS score
       FROM chunks_fts JOIN chunks c ON c.rowid = chunks_fts.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(matchQuery, poolSize);
  return filterByScope(rows, db, scopes).map((row) => row.chunk_id);
}

// Reciprocal rank fusion. Each leg contributes 1/(RRF_K + rank) per chunk
// id. Ranks are 1-based. An id absent from a leg simply doesn't score there.
export function reciprocalRankFusion(rankedLists, k = RRF_K) {
  const scores = new Map();
  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.query) fail('usage: retrieve.mjs "query" [-k 8] [--scope docs|ideas|all] [--stub]');
  if (!Number.isInteger(flags.k) || flags.k < 1) fail("retrieve.mjs: -k must be a positive integer");
  const scopes = SCOPE_SOURCES[flags.scope];
  if (!scopes) fail(`retrieve.mjs: --scope must be one of docs, ideas, all (got ${flags.scope})`);

  const dbPath = path.resolve(process.cwd(), "index", "refinery.db");
  if (!fs.existsSync(dbPath)) fail("retrieve.mjs: no index found, run indexer.mjs first");

  const db = openReadonlyDb(dbPath);

  const poolSize = Math.max(flags.k * 5, 20);
  const queryVector = embedQuery(flags.query, flags.stub);
  const vectorIds = vectorLeg(db, queryVector, poolSize, scopes);
  const lexicalIds = lexicalLeg(db, flags.query, poolSize, scopes);
  const fusedIds = reciprocalRankFusion([vectorIds, lexicalIds]).slice(0, flags.k);

  const getText = db.prepare("SELECT text FROM chunks WHERE id = ?");
  const blocks = fusedIds.map((id) => `${id}\n${getText.get(id).text}`);
  console.log(blocks.join("\n\n"));

  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
