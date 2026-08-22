import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "mail.mjs");

function tmpRefinery() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mail-rotate-test-"));
}

function run(cwd, args, input) {
  return spawnSync("node", [SCRIPT, ...args], { cwd, input: input ?? "", encoding: "utf8" });
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// A second timestamp guaranteed to fall in the same UTC month as `iso`,
// regardless of where in its month `iso` lands.
function sameMonthNeighbor(iso) {
  const d = new Date(iso);
  const month = d.getUTCMonth();
  const forward = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const candidate = forward.getUTCMonth() === month ? forward : new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return candidate.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function block({ from, at, hops = 0 }, body) {
  return `--- from: ${from}  at: ${at}  hops: ${hops} ---\n${body}\n\n`;
}

function writeSenderFile(cwd, recipient, sender, text) {
  const dir = path.join(cwd, "mail", recipient);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sender}.md`), text);
}

function writeCursor(cwd, recipient, sender, at) {
  const dir = path.join(cwd, "mail", recipient);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `.cursor-${sender}`), `${at}\n`);
}

test("a read block older than the window moves to the archive; a read block inside the window stays", () => {
  const cwd = tmpRefinery();
  const oldAt = isoDaysAgo(40);
  const recentAt = isoDaysAgo(5);
  const oldBlock = block({ from: "harvester", at: oldAt }, "old and read");
  const recentBlock = block({ from: "harvester", at: recentAt }, "recent and read");
  writeSenderFile(cwd, "scorer", "harvester", oldBlock + recentBlock);
  // Cursor sits at "just read", after both blocks, so both count as read.
  writeCursor(cwd, "scorer", "harvester", isoDaysAgo(1));

  const result = run(cwd, ["rotate", "--days", "14"]);
  assert.equal(result.status, 0);

  const remaining = fs.readFileSync(path.join(cwd, "mail", "scorer", "harvester.md"), "utf8");
  assert.equal(remaining, recentBlock);
  assert.doesNotMatch(remaining, /old and read/);

  const yyyymm = oldAt.slice(0, 7).replace("-", "");
  const archived = fs.readFileSync(
    path.join(cwd, "mail", "archive", "scorer", `harvester-${yyyymm}.md`),
    "utf8",
  );
  assert.equal(archived, oldBlock);
});

test("an unread block stays put no matter how old it is", () => {
  const cwd = tmpRefinery();
  const oldAt = isoDaysAgo(40);
  const oldBlock = block({ from: "harvester", at: oldAt }, "old but never read");
  writeSenderFile(cwd, "scorer", "harvester", oldBlock);
  // Cursor is older than the block itself, so the block arrived after the
  // last read and counts as unread even though it is well past the window.
  writeCursor(cwd, "scorer", "harvester", isoDaysAgo(50));

  const result = run(cwd, ["rotate", "--days", "14"]);
  assert.equal(result.status, 0);

  const remaining = fs.readFileSync(path.join(cwd, "mail", "scorer", "harvester.md"), "utf8");
  assert.equal(remaining, oldBlock);
  assert.equal(fs.existsSync(path.join(cwd, "mail", "archive", "scorer")), false);
});

test("a sender file with no cursor yet is left untouched, however old its blocks are", () => {
  const cwd = tmpRefinery();
  const oldBlock = block({ from: "harvester", at: isoDaysAgo(100) }, "nobody has read this yet");
  writeSenderFile(cwd, "scorer", "harvester", oldBlock);

  const result = run(cwd, ["rotate", "--days", "14"]);
  assert.equal(result.status, 0);

  const remaining = fs.readFileSync(path.join(cwd, "mail", "scorer", "harvester.md"), "utf8");
  assert.equal(remaining, oldBlock);
  assert.equal(fs.existsSync(path.join(cwd, "mail", "archive")), false);
});

test("a rotated sender file still reads exactly the unread set, before and after rotation", () => {
  const cwd = tmpRefinery();
  const oldReadAt = isoDaysAgo(40);
  const recentReadAt = isoDaysAgo(5);
  const unreadAt = isoDaysAgo(1);
  const oldReadBlock = block({ from: "harvester", at: oldReadAt }, "old read one");
  const recentReadBlock = block({ from: "harvester", at: recentReadAt }, "recent read two");
  const unreadBlock = block({ from: "harvester", at: unreadAt }, "still unread three");
  writeSenderFile(cwd, "scorer", "harvester", oldReadBlock + recentReadBlock + unreadBlock);
  writeCursor(cwd, "scorer", "harvester", recentReadAt);

  const peekBefore = run(cwd, ["peek", "scorer"]);
  assert.match(peekBefore.stdout, /still unread three/);
  assert.doesNotMatch(peekBefore.stdout, /old read one/);
  assert.doesNotMatch(peekBefore.stdout, /recent read two/);

  const rotated = run(cwd, ["rotate", "--days", "14"]);
  assert.equal(rotated.status, 0);

  const peekAfter = run(cwd, ["peek", "scorer"]);
  assert.equal(peekAfter.stdout, peekBefore.stdout);

  const remaining = fs.readFileSync(path.join(cwd, "mail", "scorer", "harvester.md"), "utf8");
  assert.equal(remaining, recentReadBlock + unreadBlock);

  const read = run(cwd, ["read", "scorer"]);
  assert.match(read.stdout, /still unread three/);
  const cursor = fs.readFileSync(path.join(cwd, "mail", "scorer", ".cursor-harvester"), "utf8").trim();
  assert.equal(cursor, unreadAt);

  const peekOnceRead = run(cwd, ["peek", "scorer"]);
  assert.equal(peekOnceRead.stdout.trim(), "no unread mail");
});

test("archive files are named by the block's own month and stay byte-exact across two rotations", () => {
  const cwd = tmpRefinery();
  const farAt = isoDaysAgo(400);
  const nearAt = isoDaysAgo(40);
  const farBlock = block({ from: "harvester", at: farAt }, "far past month");
  const nearBlock = block({ from: "harvester", at: nearAt }, "nearer past month");
  writeSenderFile(cwd, "scorer", "harvester", farBlock + nearBlock);
  writeCursor(cwd, "scorer", "harvester", isoDaysAgo(1));

  run(cwd, ["rotate", "--days", "14"]);

  const farYyyymm = farAt.slice(0, 7).replace("-", "");
  const nearYyyymm = nearAt.slice(0, 7).replace("-", "");
  assert.notEqual(farYyyymm, nearYyyymm);

  const archiveDir = path.join(cwd, "mail", "archive", "scorer");
  const farFile = path.join(archiveDir, `harvester-${farYyyymm}.md`);
  const nearFile = path.join(archiveDir, `harvester-${nearYyyymm}.md`);
  assert.match(path.basename(farFile), /^harvester-\d{6}\.md$/);
  assert.equal(fs.readFileSync(farFile, "utf8"), farBlock);
  assert.equal(fs.readFileSync(nearFile, "utf8"), nearBlock);

  // A second rotation with a freshly-read, freshly-old block appends into the
  // existing month file rather than clobbering what is already archived.
  const secondNearAt = sameMonthNeighbor(nearAt);
  const secondNearBlock = block({ from: "harvester", at: secondNearAt }, "another block, same month");
  writeSenderFile(cwd, "scorer", "harvester", secondNearBlock);
  writeCursor(cwd, "scorer", "harvester", isoDaysAgo(1));

  run(cwd, ["rotate", "--days", "14"]);

  assert.equal(fs.readFileSync(nearFile, "utf8"), nearBlock + secondNearBlock);
});
