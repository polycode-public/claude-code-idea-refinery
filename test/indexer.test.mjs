import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { load as loadVecExtension } from "sqlite-vec";
import { splitIntoSections, chunkSections, estimateTokens } from "../src/indexer.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(TEST_DIR, "..", "src", "indexer.mjs");
const RETRIEVE_SCRIPT = path.join(TEST_DIR, "..", "src", "retrieve.mjs");
const FIXTURE = fs.readFileSync(path.join(TEST_DIR, "fixtures", "source-doc.md"), "utf8");

function tmpCwd() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "indexer-test-"));
  fs.mkdirSync(path.join(cwd, "docs"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "docs", "0001-usage-billing.md"), FIXTURE);
  return cwd;
}

// A minimal idea doc, shaped like the idea-doc skill's format (front
// matter plus `# Idea` / `## Comments`). Shares the word "kumquat" with
// the docs fixture so a single lexical query can hit both sources.
function ideaFixture(body) {
  return [
    "---",
    "id: idea-0001",
    "title: Test Idea For Indexing",
    "status: seed",
    "owner: harvester",
    "created: 2026-01-01T00:00Z",
    "updated: 2026-01-01T00:00Z",
    "tags: [test]",
    "parent: null",
    "merged-into: null",
    "sources:",
    "  - https://example.com/source",
    "hops: 0",
    "---",
    "",
    "# Idea",
    "",
    body,
    "",
    "## Comments",
    "",
    "### scorer — 2026-01-01T00:00Z",
    "",
    "A comment on the idea, part of the same body text the indexer chunks.",
    "",
  ].join("\n");
}

function writeIdea(cwd, bucket, body) {
  const dir = path.join(cwd, `ideas-${bucket}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "idea-0001.md"), ideaFixture(body));
}

function tmpCwdWithIdea(body = "A test idea about kumquat orchards, used to exercise the ideas source path.") {
  const cwd = tmpCwd();
  writeIdea(cwd, "0-seeds", body);
  return cwd;
}

// No docs/ directory at all, so a run without --no-annotate still never
// shells out to claude: there is nothing of source docs to annotate, and
// ideas never are.
function tmpCwdIdeaOnly(body = "A test idea about kumquat orchards, used to exercise the ideas source path.") {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "indexer-test-"));
  writeIdea(cwd, "0-seeds", body);
  return cwd;
}

function runIndexer(cwd, extraArgs = []) {
  const result = spawnSync("node", [SCRIPT, "--no-annotate", "--stub", ...extraArgs], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runRetrieve(cwd, args) {
  const result = spawnSync("node", [RETRIEVE_SCRIPT, ...args, "--stub"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

// Splits retrieve.mjs's stdout (chunk id, then text, blank-line separated
// between results) back into one id per block.
function resultIds(stdout) {
  return stdout
    .trim()
    .split(/\n\n(?=(?:docs\/|idea-))/)
    .map((block) => block.split("\n")[0]);
}

function openDb(cwd) {
  const db = new Database(path.join(cwd, "index", "refinery.db"), { readonly: true });
  loadVecExtension(db);
  return db;
}

function chunkRows(db) {
  return db.prepare("SELECT id, doc_id, seq, text FROM chunks ORDER BY seq").all();
}

// --- pure chunking behaviour -------------------------------------------------

test("a section that fits in one chunk is never split across chunks", () => {
  const body = [
    "# Title",
    "",
    "Short intro paragraph.",
    "",
    "## Small Section",
    "",
    "A short section that must land in its own chunk without being split.",
  ].join("\n");

  const chunks = chunkSections(splitIntoSections(body));
  const withSmallSection = chunks.filter((chunk) =>
    chunk.includes("A short section that must land in its own chunk without being split."),
  );
  assert.equal(withSmallSection.length, 1);
});

test("an oversized section is split by paragraph, each piece carrying the heading", () => {
  const paragraphAlpha = `${"Alpha ".repeat(170).trim()}.`;
  const paragraphBravo = `${"Bravo ".repeat(170).trim()}.`;
  const paragraphCharlie = `${"Charlie ".repeat(170).trim()}.`;
  const body = [
    "# Title",
    "",
    "Short intro.",
    "",
    "## Big Section",
    "",
    paragraphAlpha,
    "",
    paragraphBravo,
    "",
    paragraphCharlie,
    "",
    "## Small Section",
    "",
    "A short trailing section that must land in its own chunk without being split.",
  ].join("\n");

  const chunks = chunkSections(splitIntoSections(body));

  // Every source paragraph survives whole, in exactly one chunk.
  for (const paragraph of [paragraphAlpha, paragraphBravo, paragraphCharlie]) {
    assert.equal(chunks.filter((chunk) => chunk.includes(paragraph)).length, 1);
  }
  // The trailing small section is untouched by the big section's split.
  assert.equal(
    chunks.filter((chunk) =>
      chunk.includes("A short trailing section that must land in its own chunk without being split."),
    ).length,
    1,
  );
  // Every piece of the split section still carries its heading.
  const bigSectionPieces = chunks.filter((chunk) => chunk.startsWith("## Big Section"));
  assert.equal(bigSectionPieces.length, 3);
  // No produced chunk is left absurdly oversized by the split.
  for (const chunk of chunks) assert.ok(estimateTokens(chunk) < 500 * 1.5);
});

test("chunking a realistic section lands near the 500-token target", () => {
  const body = FIXTURE.slice(FIXTURE.indexOf("\n---\n") + 5);
  const chunks = chunkSections(splitIntoSections(body));
  const nearTarget = chunks.filter((chunk) => {
    const tokens = estimateTokens(chunk);
    return tokens >= 300 && tokens <= 500;
  });
  assert.ok(nearTarget.length >= 1, "expected at least one chunk within 300-500 estimated tokens");
});

// --- full pipeline -----------------------------------------------------------

test("chunk ids are stable across reruns", () => {
  const cwd = tmpCwd();
  runIndexer(cwd);
  const firstIds = chunkRows(openDb(cwd)).map((row) => row.id);

  runIndexer(cwd);
  const secondIds = chunkRows(openDb(cwd)).map((row) => row.id);

  assert.deepEqual(secondIds, firstIds);
  assert.ok(firstIds.every((id) => /^docs\/0001#c\d+$/.test(id)));
});

test("--no-annotate round-trips the fixture into the DB and back out by id", () => {
  const cwd = tmpCwd();
  runIndexer(cwd);
  const db = openDb(cwd);

  const rows = chunkRows(db);
  assert.equal(rows[0].doc_id, "docs/0001");

  const kumquatChunk = rows.find((row) => row.text.includes("kumquat"));
  assert.ok(kumquatChunk, "expected a chunk mentioning kumquat");
  assert.equal(kumquatChunk.id, "docs/0001#c2");
  // --no-annotate means the stored text is exactly the raw chunk, no
  // situating paragraph prepended ahead of the heading.
  assert.ok(kumquatChunk.text.startsWith("## Pilot Program Notes: Kumquat Orchard Settlement"));

  const docRow = db.prepare("SELECT * FROM docs WHERE id = ?").get("docs/0001");
  assert.equal(docRow.sha256, "3f9a1c2b5d7e8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081");
  assert.equal(docRow.title, "Usage Billing Reference");
});

test("re-running upserts, never duplicates", () => {
  const cwd = tmpCwd();
  const first = runIndexer(cwd);
  const second = runIndexer(cwd);

  assert.equal(first.chunksIndexed, second.chunksIndexed);

  const db = openDb(cwd);
  const rows = chunkRows(db);
  const uniqueIds = new Set(rows.map((row) => row.id));
  assert.equal(uniqueIds.size, rows.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM chunks_fts").get().c, rows.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM chunks_vec").get().c, rows.length);
});

test("--new-only skips a doc whose sha256 is already recorded", () => {
  const cwd = tmpCwd();
  runIndexer(cwd);
  const before = openDb(cwd).prepare("SELECT indexed_at FROM docs WHERE id = ?").get("docs/0001");

  const summary = runIndexer(cwd, ["--new-only"]);
  assert.equal(summary.docsProcessed, 0);
  assert.equal(summary.docsSkipped, 1);

  const after = openDb(cwd).prepare("SELECT indexed_at FROM docs WHERE id = ?").get("docs/0001");
  assert.equal(after.indexed_at, before.indexed_at);
});

// --- the ideas source ----------------------------------------------------------

test("an idea doc indexes under source ideas", () => {
  const cwd = tmpCwdWithIdea();
  const summary = runIndexer(cwd);

  assert.equal(summary.ideasScanned, 1);
  assert.equal(summary.ideasProcessed, 1);

  const db = openDb(cwd);
  const docRow = db.prepare("SELECT * FROM docs WHERE id = ?").get("idea-0001");
  assert.ok(docRow, "expected an idea-0001 row in docs");
  assert.equal(docRow.source, "ideas");

  const rows = chunkRows(db).filter((row) => row.doc_id === "idea-0001");
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => /^idea-0001#c\d+$/.test(row.id)));

  // Docs still index under source docs, unaffected by the ideas addition.
  const docsDocRow = db.prepare("SELECT source FROM docs WHERE id = ?").get("docs/0001");
  assert.equal(docsDocRow.source, "docs");
});

test("ideas never get a claude annotation, even without --no-annotate", () => {
  // No docs/ dir here, so this run (deliberately omitting --no-annotate)
  // never shells out to claude: the only doc is source ideas, which the
  // indexer never annotates regardless of the flag.
  const cwd = tmpCwdIdeaOnly();
  const result = spawnSync("node", [SCRIPT, "--stub"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const db = openDb(cwd);
  const ideaChunk = chunkRows(db).find((row) => row.doc_id === "idea-0001");
  assert.ok(ideaChunk.text.startsWith("# Idea"));
});

test("--scope docs never returns an idea chunk", () => {
  const cwd = tmpCwdWithIdea();
  runIndexer(cwd);

  const stdout = runRetrieve(cwd, ["kumquat", "-k", "10"]);
  const ids = resultIds(stdout);
  assert.ok(ids.length > 0);
  assert.ok(ids.every((id) => id.startsWith("docs/")));
});

test("--scope all returns both docs and idea chunks", () => {
  const cwd = tmpCwdWithIdea();
  runIndexer(cwd);

  const stdout = runRetrieve(cwd, ["kumquat", "-k", "10", "--scope", "all"]);
  const ids = resultIds(stdout);
  assert.ok(ids.some((id) => id.startsWith("docs/")), "expected a docs chunk in --scope all results");
  assert.ok(ids.some((id) => id.startsWith("idea-")), "expected an ideas chunk in --scope all results");
});

test("--scope ideas returns only idea chunks", () => {
  const cwd = tmpCwdWithIdea();
  runIndexer(cwd);

  const stdout = runRetrieve(cwd, ["kumquat", "-k", "10", "--scope", "ideas"]);
  const ids = resultIds(stdout);
  assert.ok(ids.length > 0);
  assert.ok(ids.every((id) => id.startsWith("idea-")));
});

test("re-indexing an unchanged idea writes nothing new", () => {
  const cwd = tmpCwdWithIdea();
  runIndexer(cwd);
  const before = openDb(cwd).prepare("SELECT sha256, indexed_at FROM docs WHERE id = ?").get("idea-0001");
  const beforeChunkCount = chunkRows(openDb(cwd)).filter((row) => row.doc_id === "idea-0001").length;

  // No --new-only: the ideas skip is unconditional, unlike the docs one.
  const summary = runIndexer(cwd);
  assert.equal(summary.ideasProcessed, 0);
  assert.equal(summary.ideasSkipped, 1);

  const after = openDb(cwd).prepare("SELECT sha256, indexed_at FROM docs WHERE id = ?").get("idea-0001");
  assert.equal(after.indexed_at, before.indexed_at);
  assert.equal(after.sha256, before.sha256);

  const afterChunkCount = chunkRows(openDb(cwd)).filter((row) => row.doc_id === "idea-0001").length;
  assert.equal(afterChunkCount, beforeChunkCount);
});

test("a changed idea re-indexes without duplicating", () => {
  const cwd = tmpCwdWithIdea();
  runIndexer(cwd);
  const before = openDb(cwd).prepare("SELECT sha256 FROM docs WHERE id = ?").get("idea-0001");

  writeIdea(cwd, "0-seeds", "A revised idea about kumquat orchards, now with different body text entirely.");
  const summary = runIndexer(cwd);
  assert.equal(summary.ideasProcessed, 1);
  assert.equal(summary.ideasSkipped, 0);

  const db = openDb(cwd);
  const after = db.prepare("SELECT sha256 FROM docs WHERE id = ?").get("idea-0001");
  assert.notEqual(after.sha256, before.sha256);

  const rows = chunkRows(db).filter((row) => row.doc_id === "idea-0001");
  const uniqueIds = new Set(rows.map((row) => row.id));
  assert.equal(uniqueIds.size, rows.length);
  assert.ok(rows.some((row) => row.text.includes("different body text entirely")));
});
