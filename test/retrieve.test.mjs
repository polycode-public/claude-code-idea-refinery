import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { reciprocalRankFusion, vectorLeg, lexicalLeg, openReadonlyDb } from "../src/retrieve.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEXER_SCRIPT = path.join(TEST_DIR, "..", "src", "indexer.mjs");
const RETRIEVE_SCRIPT = path.join(TEST_DIR, "..", "src", "retrieve.mjs");
const FIXTURE = fs.readFileSync(path.join(TEST_DIR, "fixtures", "source-doc.md"), "utf8");

function tmpCwd() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "retrieve-test-"));
  fs.mkdirSync(path.join(cwd, "docs"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "docs", "0001-usage-billing.md"), FIXTURE);
  const indexed = spawnSync("node", [INDEXER_SCRIPT, "--no-annotate", "--stub"], { cwd, encoding: "utf8" });
  assert.equal(indexed.status, 0, indexed.stderr);
  return cwd;
}

// Splits retrieve.mjs's stdout (chunk id, then text, blank-line separated
// between results) back into one id per block.
function resultIds(stdout) {
  return stdout
    .trim()
    .split(/\n\n(?=docs\/)/)
    .map((block) => block.split("\n")[0]);
}

function runRetrieve(cwd, args) {
  return spawnSync("node", [RETRIEVE_SCRIPT, ...args, "--stub"], { cwd, encoding: "utf8" });
}

// --- reciprocal rank fusion, hand-computed ------------------------------------

test("RRF matches a hand-computed fusion of two ranked lists", () => {
  const lexical = ["a", "b", "c"];
  const vector = ["c", "d"];
  const k = 60;

  // a: 1/61 (lexical rank 1)
  // b: 1/62 (lexical rank 2)
  // c: 1/63 (lexical rank 3) + 1/61 (vector rank 1)
  // d: 1/62 (vector rank 2)
  // sorted desc: c, a, then b/d tie at 1/62, broken alphabetically.
  const expected = ["c", "a", "b", "d"];

  assert.deepEqual(reciprocalRankFusion([lexical, vector], k), expected);
});

test("RRF gives no credit to an id missing from every list", () => {
  assert.deepEqual(reciprocalRankFusion([[], []]), []);
});

// --- hybrid legs over the fixture corpus --------------------------------------

test("a lexical-only match and a vector-only match both surface", () => {
  const cwd = tmpCwd();
  const db = openReadonlyDb(path.join(cwd, "index", "refinery.db"));

  // "kumquat" appears in exactly one chunk (the pilot-program section) and
  // nowhere else in the fixture, so the lexical leg matches only that
  // chunk. The vector leg still ranks every chunk (KNN has no match
  // filter) and, diluted by ~400 unrelated tokens, ranks the kumquat
  // chunk last rather than first.
  const embedResult = spawnSync(
    "node",
    [path.join(TEST_DIR, "..", "src", "embed.mjs"), "--stub"],
    { cwd, input: JSON.stringify(["kumquat"]), encoding: "utf8" },
  );
  const queryVector = JSON.parse(embedResult.stdout)[0];

  const lexicalIds = lexicalLeg(db, "kumquat", 10);
  const vectorIds = vectorLeg(db, queryVector, 10);

  assert.deepEqual(lexicalIds, ["docs/0001#c2"]);
  assert.equal(vectorIds.length, 3);
  assert.notEqual(vectorIds[0], "docs/0001#c2", "the lexical hit should not also be the top vector hit");

  const topVectorId = vectorIds[0];
  assert.ok(!lexicalIds.includes(topVectorId), "the top vector hit should have zero lexical presence");

  // The full hybrid pipeline surfaces both: the lexical-favoured chunk
  // (docs/0001#c2) and the vector-favoured chunk (the top of vectorIds),
  // in that order, at k=2.
  const result = runRetrieve(cwd, ["kumquat", "-k", "2"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(resultIds(result.stdout), ["docs/0001#c2", topVectorId]);
});

// --- -k bounds the output ------------------------------------------------------

test("-k bounds the number of results", () => {
  const cwd = tmpCwd();

  const one = runRetrieve(cwd, ["usage billing", "-k", "1"]);
  assert.equal(one.status, 0, one.stderr);
  assert.equal(resultIds(one.stdout).length, 1);

  const three = runRetrieve(cwd, ["usage billing", "-k", "3"]);
  assert.equal(three.status, 0, three.stderr);
  assert.equal(resultIds(three.stdout).length, 3);
});

// --- missing index -------------------------------------------------------------

test("exits non-zero with a plain message when the index is missing", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "retrieve-test-noindex-"));
  const result = runRetrieve(cwd, ["anything"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no index found/);
});
