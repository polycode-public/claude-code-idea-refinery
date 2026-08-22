import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "next-id.mjs");

function tmpRefinery() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "next-id-test-"));
}

function run(cwd) {
  return spawnSync("node", [SCRIPT], { cwd, encoding: "utf8" });
}

function touch(cwd, relPath) {
  const full = path.join(cwd, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "");
}

test("an empty tree mints idea-0001", () => {
  const cwd = tmpRefinery();
  const result = run(cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "idea-0001");
});

test("a tree with no ideas directory at all mints idea-0001", () => {
  const cwd = tmpRefinery();
  const result = run(cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "idea-0001");
});

test("the max id is found across live buckets, killed/ and archive/", () => {
  const cwd = tmpRefinery();
  touch(cwd, "ideas-0-seeds/idea-0003.md");
  touch(cwd, "ideas-1-scored/idea-0007.md");
  touch(cwd, "ideas-killed/idea-0012.md");
  touch(cwd, "ideas-archive/idea-0009.md");

  const result = run(cwd);
  assert.equal(result.stdout.trim(), "idea-0013");
});

test("a split child's suffixed id still counts toward the max", () => {
  const cwd = tmpRefinery();
  touch(cwd, "ideas-archive/idea-0042.md");
  touch(cwd, "ideas-1-scored/idea-0042a.md");
  touch(cwd, "ideas-1-scored/idea-0042b.md");

  const result = run(cwd);
  assert.equal(result.stdout.trim(), "idea-0043");
});

test("zero-padding holds past 999", () => {
  const cwd = tmpRefinery();
  touch(cwd, "ideas-4-ranked/idea-0999.md");

  const result = run(cwd);
  assert.equal(result.stdout.trim(), "idea-1000");
});
