#!/usr/bin/env node
// src/indexer.mjs — chunks docs/*.md and the idea corpus in the ideas-*
// buckets, optionally annotates each doc chunk with a situating paragraph, embeds
// via embed.mjs, and upserts everything into index/refinery.db (a vec0
// table for embeddings plus an FTS5 table for lexical search, both keyed
// by chunk id). A `source` column on the docs table (docs | ideas) tags
// which corpus each row came from.
//
// Usage: indexer.mjs [--new-only] [--no-annotate] [--stub]
//
// --new-only skips a doc entirely when its sha256 front-matter field
// already matches the sha256 recorded for that doc id, so a rerun over an
// unchanged corpus does no work. Without it every doc is reprocessed, which
// keeps chunking (and therefore chunk ids) a pure function of the doc body.
//
// Ideas have no fetched sha256 field to skip on, so they are hashed at
// index time (sha256 of the body) and always skipped when that hash
// matches what is already recorded, independent of --new-only. Ideas are
// self-describing documents, not fetched sources, so they never get a
// claude annotation — the annotation cap and --no-annotate apply to docs
// only.
//
// --no-annotate skips every `claude -p` call so the pipeline stays
// deterministic and offline; tests always pass it. --stub is forwarded to
// embed.mjs so tests never touch the network there either.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { load as loadVecExtension } from "sqlite-vec";
import { parseFrontMatter, fmField } from "./front-matter.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EMBED_SCRIPT = path.join(SCRIPT_DIR, "embed.mjs");
const BUDGET_SCRIPT = path.join(SCRIPT_DIR, "budget.mjs");

// Tokens are approximated as chars/4 (roughly the average for English
// prose under Claude/GPT tokenizers) rather than pulling in a real
// tokenizer for a chunk-sizing heuristic.
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 500;
const ANNOTATION_CAP = 40;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  return {
    newOnly: argv.includes("--new-only"),
    noAnnotate: argv.includes("--no-annotate"),
    stub: argv.includes("--stub"),
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// --- doc parsing -----------------------------------------------------------

export function parseDocFile(fileName, raw) {
  const parsed = parseFrontMatter(raw);
  if (!parsed) return null;
  const { fm, body } = parsed;

  const sha256 = fmField(fm, "sha256");
  const idMatch = fileName.match(/^(\d+)/);
  if (!idMatch || !sha256) return null;

  return {
    docId: `docs/${idMatch[1]}`,
    url: fmField(fm, "url"),
    title: fmField(fm, "title"),
    fetched: fmField(fm, "fetched"),
    sha256,
    body,
    source: "docs",
  };
}

// Idea docs carry an `id` field (idea-NNNN) instead of a fetched sha256,
// so their content hash is computed here, at index time, from the body.
// The idea id is the doc id as-is: bucket-independent, so an idea keeps
// its chunks when it moves buckets, and never colliding with docs/NNNN.
export function parseIdeaFile(fileName, raw) {
  const parsed = parseFrontMatter(raw);
  if (!parsed) return null;
  const { fm, body } = parsed;

  const id = fmField(fm, "id");
  if (!id) return null;

  return {
    docId: id,
    url: null,
    title: fmField(fm, "title"),
    fetched: null,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    body,
    source: "ideas",
  };
}

// Every idea markdown file across every ideas-* bucket, found by matching
// the directory prefix rather than naming buckets, so a new bucket needs
// no change here.
export function ideaMarkdownFiles() {
  return fs
    .globSync("ideas-*/**/*.md")
    .map((file) => path.resolve(file))
    .sort();
}

// --- heading-aware chunking --------------------------------------------------

export function splitIntoSections(body) {
  const lines = body.split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      sections.push(current);
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  return sections
    .map((section) => ({ heading: section.heading, bodyText: section.lines.join("\n").trim() }))
    .filter((section) => section.heading || section.bodyText.length > 0);
}

function sectionFullText(section) {
  if (!section.heading) return section.bodyText;
  return section.bodyText ? `${section.heading}\n\n${section.bodyText}` : section.heading;
}

// A paragraph too big for one chunk on its own is hard-split on word
// boundaries into TARGET_CHUNK_TOKENS-sized pieces, each still carrying the
// section's heading so the piece is self-contained.
function hardSplitParagraph(paragraph, headingPrefix) {
  const maxChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
  const words = paragraph.split(/\s+/);
  const pieces = [];
  let current = [];
  let currentLen = 0;

  for (const word of words) {
    if (currentLen + word.length + 1 > maxChars && current.length) {
      pieces.push(`${headingPrefix}${current.join(" ")}`.trim());
      current = [];
      currentLen = 0;
    }
    current.push(word);
    currentLen += word.length + 1;
  }
  if (current.length) pieces.push(`${headingPrefix}${current.join(" ")}`.trim());
  return pieces;
}

// Splits one oversized section into multiple chunks, paragraph by
// paragraph, never breaking a paragraph unless the paragraph alone
// exceeds the target.
function splitOversizedSection(section) {
  const headingPrefix = section.heading ? `${section.heading}\n\n` : "";
  const paragraphs = section.bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces = [];
  let current = [];
  let currentTokens = estimateTokens(headingPrefix);

  const flush = () => {
    if (!current.length) return;
    pieces.push(`${headingPrefix}${current.join("\n\n")}`.trim());
    current = [];
    currentTokens = estimateTokens(headingPrefix);
  };

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    if (paragraphTokens > TARGET_CHUNK_TOKENS) {
      flush();
      pieces.push(...hardSplitParagraph(paragraph, headingPrefix));
      continue;
    }
    if (currentTokens + paragraphTokens > TARGET_CHUNK_TOKENS && current.length) flush();
    current.push(paragraph);
    currentTokens += paragraphTokens;
  }
  flush();

  return pieces.length ? pieces : [sectionFullText(section)];
}

// Greedily merges whole sections into a chunk until the target would be
// exceeded, so a section that fits on its own is never split across chunk
// boundaries; a section too big to fit alone is handed to
// splitOversizedSection instead.
export function chunkSections(sections) {
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push(current.map(sectionFullText).join("\n\n").trim());
    current = [];
    currentTokens = 0;
  };

  for (const section of sections) {
    const fullText = sectionFullText(section);
    const tokens = estimateTokens(fullText);

    if (tokens > TARGET_CHUNK_TOKENS) {
      flush();
      chunks.push(...splitOversizedSection(section));
      continue;
    }
    if (currentTokens + tokens > TARGET_CHUNK_TOKENS && current.length) flush();
    current.push(section);
    currentTokens += tokens;
  }
  flush();

  return chunks;
}

// --- annotation --------------------------------------------------------------

function annotationPrompt(chunkText, title, url) {
  return [
    "Write a one-paragraph situating description (50-100 words) of the",
    "chunk below, placing it within its source document. Mention the",
    `document title and topic. Document title: ${title || "unknown"}.`,
    `Document URL: ${url || "unknown"}.`,
    "",
    "Chunk:",
    chunkText,
    "",
    "Respond with only the paragraph, no preamble or heading.",
  ].join("\n");
}

function logAnnotationResult(stdout) {
  if (!stdout) return;
  spawnSync(process.execPath, [BUDGET_SCRIPT, "log", "indexer"], {
    input: stdout,
    encoding: "utf8",
  });
}

function annotateChunk(chunkText, title, url) {
  const result = spawnSync(
    "claude",
    ["-p", annotationPrompt(chunkText, title, url), "--model", "haiku", "--output-format", "json"],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  logAnnotationResult(result.stdout);
  if (result.status !== 0 || !result.stdout) return null;

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  const text = typeof parsed.result === "string" ? parsed.result.trim() : null;
  return text && text.length ? text : null;
}

// --- embedding -----------------------------------------------------------

function embedTexts(texts, stub) {
  const args = [EMBED_SCRIPT];
  if (stub) args.push("--stub");
  const result = spawnSync(process.execPath, args, {
    input: JSON.stringify(texts),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`indexer.mjs: embed.mjs failed: ${(result.stderr || "").trim()}`);
  return JSON.parse(result.stdout);
}

// --- database --------------------------------------------------------------

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

// The docs table predates the `source` column: an existing db from before
// C6 has the table without it, so it is added by migration rather than in
// the CREATE TABLE, defaulting existing rows to 'docs'.
function ensureSourceColumn(db) {
  const columns = db.prepare("PRAGMA table_info(docs)").all();
  if (!columns.some((col) => col.name === "source")) {
    db.exec("ALTER TABLE docs ADD COLUMN source TEXT NOT NULL DEFAULT 'docs'");
  }
}

function openDb(dbPath) {
  const db = new Database(dbPath);
  loadVecExtension(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      url TEXT,
      title TEXT,
      fetched TEXT,
      sha256 TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    )
  `);
  ensureSourceColumn(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      text TEXT NOT NULL
    )
  `);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content='chunks', content_rowid='rowid')`);
  return db;
}

// chunks_vec's dimension is fixed at creation time, so the table is
// created lazily on the first run that actually has vectors to store.
function ensureVecTable(db, dim) {
  if (hasTable(db, "chunks_vec")) return;
  db.exec(`CREATE VIRTUAL TABLE chunks_vec USING vec0(id INTEGER PRIMARY KEY, embedding float[${dim}])`);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Replaces every chunk belonging to the given doc ids and inserts the
// fresh set, keyed by the same chunk ids, so a rerun never duplicates and
// never leaves a stale chunk behind when a doc shrinks.
function writeIndex(db, docsToProcess, chunkRecords, vectors) {
  const vecTableReady = chunkRecords.length > 0;
  if (vecTableReady) ensureVecTable(db, vectors[0].length);

  const run = db.transaction(() => {
    const chunkRowsForDoc = db.prepare("SELECT rowid FROM chunks WHERE doc_id = ?");
    const delFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
    const delVec = hasTable(db, "chunks_vec")
      ? db.prepare("DELETE FROM chunks_vec WHERE id = ?").safeIntegers(true)
      : null;
    const delChunk = db.prepare("DELETE FROM chunks WHERE rowid = ?");

    for (const doc of docsToProcess) {
      for (const row of chunkRowsForDoc.all(doc.docId)) {
        delFts.run(row.rowid);
        if (delVec) delVec.run(BigInt(row.rowid));
        delChunk.run(row.rowid);
      }
    }

    if (chunkRecords.length) {
      const insChunk = db.prepare("INSERT INTO chunks (id, doc_id, seq, text) VALUES (?, ?, ?, ?)");
      const insFts = db.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)");
      const insVec = db.prepare("INSERT INTO chunks_vec (id, embedding) VALUES (?, ?)").safeIntegers(true);

      chunkRecords.forEach((record, i) => {
        const info = insChunk.run(record.chunkId, record.docId, record.seq, record.text);
        const rowid = info.lastInsertRowid;
        insFts.run(rowid, record.indexedText);
        insVec.run(BigInt(rowid), JSON.stringify(vectors[i]));
      });
    }

    const upsertDoc = db.prepare(`
      INSERT INTO docs (id, url, title, fetched, sha256, indexed_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url, title = excluded.title, fetched = excluded.fetched,
        sha256 = excluded.sha256, indexed_at = excluded.indexed_at, source = excluded.source
    `);
    const stamp = nowIso();
    for (const doc of docsToProcess) {
      upsertDoc.run(doc.docId, doc.url, doc.title, doc.fetched, doc.sha256, stamp, doc.source);
    }
  });
  run();
}

// --- main --------------------------------------------------------------

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const docsDir = path.resolve(process.cwd(), "docs");
  const indexDir = path.resolve(process.cwd(), "index");
  fs.mkdirSync(indexDir, { recursive: true });
  const db = openDb(path.join(indexDir, "refinery.db"));

  const files = fs.existsSync(docsDir)
    ? fs.readdirSync(docsDir).filter((name) => name.endsWith(".md")).sort()
    : [];

  const existingSha256 = db.prepare("SELECT sha256 FROM docs WHERE id = ?");
  const docsToProcess = [];
  let docsSkipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(docsDir, file), "utf8");
    const parsed = parseDocFile(file, raw);
    if (!parsed) {
      console.error(`indexer.mjs: skipping ${file}, missing front matter or sha256`);
      continue;
    }
    if (flags.newOnly) {
      const existing = existingSha256.get(parsed.docId);
      if (existing && existing.sha256 === parsed.sha256) {
        docsSkipped++;
        continue;
      }
    }
    docsToProcess.push(parsed);
  }

  const ideaFiles = ideaMarkdownFiles();
  const ideasToProcess = [];
  let ideasSkipped = 0;

  for (const file of ideaFiles) {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseIdeaFile(path.basename(file), raw);
    if (!parsed) {
      console.error(`indexer.mjs: skipping ${file}, missing front matter or id`);
      continue;
    }
    // Ideas have no fetched sha256 to gate on, only the hash computed here,
    // so the unchanged-content skip always applies, not just under
    // --new-only.
    const existing = existingSha256.get(parsed.docId);
    if (existing && existing.sha256 === parsed.sha256) {
      ideasSkipped++;
      continue;
    }
    ideasToProcess.push(parsed);
  }

  const allDocsToProcess = [...docsToProcess, ...ideasToProcess];

  let annotationsRemaining = ANNOTATION_CAP;
  const chunkRecords = [];

  for (const doc of allDocsToProcess) {
    const sections = splitIntoSections(doc.body);
    const texts = chunkSections(sections);
    texts.forEach((text, seq) => {
      let indexedText = text;
      if (!flags.noAnnotate && doc.source === "docs" && annotationsRemaining > 0) {
        const annotation = annotateChunk(text, doc.title, doc.url);
        annotationsRemaining--;
        if (annotation) indexedText = `${annotation}\n\n${text}`;
      }
      chunkRecords.push({ docId: doc.docId, chunkId: `${doc.docId}#c${seq}`, seq, text, indexedText });
    });
  }

  const vectors = chunkRecords.length
    ? embedTexts(chunkRecords.map((record) => record.indexedText), flags.stub)
    : [];

  writeIndex(db, allDocsToProcess, chunkRecords, vectors);
  db.close();

  console.log(
    JSON.stringify({
      docsScanned: files.length,
      docsProcessed: docsToProcess.length,
      docsSkipped,
      ideasScanned: ideaFiles.length,
      ideasProcessed: ideasToProcess.length,
      ideasSkipped,
      chunksIndexed: chunkRecords.length,
      chunksAnnotated: ANNOTATION_CAP - annotationsRemaining,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
