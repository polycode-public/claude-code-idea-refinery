import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const LINT = new URL("../src/lint-buckets.mjs", import.meta.url).pathname;

function makeTree(spec) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
  for (const [rel, status] of Object.entries(spec)) {
    const file = path.join(root, `ideas-${rel}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nid: x\nstatus: ${status}\n---\n`);
  }
  return root;
}

function run(root) {
  try {
    return { out: execFileSync("node", [LINT, root], { encoding: "utf8" }), code: 0 };
  } catch (e) {
    return { out: e.stdout, code: e.status };
  }
}

test("a clean tree passes", () => {
  const root = makeTree({
    "1-scored/idea-0001-alpha.md": "scored",
    "3-refined/idea-0002-beta.md": "refined",
    "operator-selected/idea-0003-gamma.md": "contested",
  });
  assert.equal(run(root).code, 0);
});

test("the same id in two buckets fails and names both", () => {
  const root = makeTree({
    "3-refined/idea-0009-echo.md": "refined",
    "4-ranked/idea-0009-echo.md": "ranked",
  });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /duplicate: idea-0009 in 3-refined and 4-ranked/);
});

test("a bucket-status mismatch fails and says what was expected", () => {
  const root = makeTree({ "4-ranked/idea-0004-delta.md": "refined" });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /status: idea-0004 in 4-ranked has status refined/);
});

test("operator-selected accepts any live stage", () => {
  const root = makeTree({ "operator-selected/idea-0005-eps.md": "ranked" });
  assert.equal(run(root).code, 0);
});
