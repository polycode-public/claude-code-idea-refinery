import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = new URL("../src/ranked.mjs", import.meta.url).pathname;

function idea(id, title, score, status, pitch) {
  return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nscore: ${score}\n---\n\n# Idea\n\n${pitch}\n`;
}

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ranked-"));
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(root, `ideas-${rel}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return root;
}

function run(root) {
  const out = path.join(root, "RANKED.md");
  execFileSync("node", [SCRIPT, root, out], { encoding: "utf8" });
  return fs.readFileSync(out, "utf8");
}

test("ranks by score, rejected and killed never appear, pinned is marked", () => {
  const root = makeTree({
    "3-refined/idea-0002-b.md": idea("idea-0002", "Beta", 70, "refined", "Second pitch. More."),
    "1-scored/idea-0001-a.md": idea("idea-0001", "Alpha", 80, "scored", "First pitch here. Extra."),
    "operator-selected/idea-0003-c.md": idea("idea-0003", "Gamma", 75, "ranked", "Third pitch."),
    "operator-rejected/idea-0004-d.md": idea("idea-0004", "Delta", 99, "rejected", "Nope."),
    "killed/idea-0005-e.md": idea("idea-0005", "Eps", 90, "killed", "Dead."),
  });
  const out = run(root);
  const rows = out.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| rank"));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /idea-0001.*80/);
  assert.match(rows[1], /idea-0003.*ranked pinned/);
  assert.match(rows[2], /idea-0002.*70/);
  assert.doesNotMatch(out, /idea-0004|idea-0005/);
});

test("one-liner is the pitch's first sentence and unscored ideas are skipped", () => {
  const root = makeTree({
    "1-scored/idea-0007-g.md": idea("idea-0007", "Gee", 55, "scored", "One sentence only? Yes. And another."),
    "0-seeds/idea-0008-h.md": idea("idea-0008", "Aitch", 60, "seeded", "Seeds never rank."),
  });
  const out = run(root);
  assert.match(out, /One sentence only\?/);
  assert.doesNotMatch(out, /idea-0008/);
});
