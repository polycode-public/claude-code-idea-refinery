import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "mail.mjs");

function tmpRefinery() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mail-test-"));
}

function run(cwd, args, input) {
  const result = spawnSync("node", [SCRIPT, ...args], { cwd, input: input ?? "", encoding: "utf8" });
  return result;
}

function send(cwd, recipient, opts, body) {
  const args = ["send", recipient, "--from", opts.from];
  if (opts.re) args.push("--re", opts.re);
  if (opts.hops !== undefined) args.push("--hops", String(opts.hops));
  return run(cwd, args, body);
}

test("a sent block round-trips through send and read", () => {
  const cwd = tmpRefinery();
  const sent = send(cwd, "scorer", { from: "harvester", re: "idea-0042" }, "Scored 68; inbound is weak.");
  assert.equal(sent.status, 0);

  const read = run(cwd, ["read", "scorer"]);
  assert.equal(read.status, 0);
  assert.match(read.stdout, /=== harvester ===/);
  assert.match(read.stdout, /from: harvester/);
  assert.match(read.stdout, /re: idea-0042/);
  assert.match(read.stdout, /hops: 0/);
  assert.match(read.stdout, /Scored 68; inbound is weak\./);
});

test("read returns only unread blocks and labels each sender", () => {
  const cwd = tmpRefinery();
  send(cwd, "scorer", { from: "harvester" }, "seed one");
  send(cwd, "scorer", { from: "wanderer" }, "seed two");

  const first = run(cwd, ["read", "scorer"]);
  assert.match(first.stdout, /=== harvester ===/);
  assert.match(first.stdout, /=== wanderer ===/);
  assert.match(first.stdout, /seed one/);
  assert.match(first.stdout, /seed two/);

  const second = run(cwd, ["read", "scorer"]);
  assert.equal(second.stdout.trim(), "no unread mail");
});

test("the cursor advances to the newest printed block's timestamp, not the clock", () => {
  const cwd = tmpRefinery();
  const dir = path.join(cwd, "mail", "scorer");
  fs.mkdirSync(dir, { recursive: true });
  // Write a block dated well in the past directly, bypassing "send", so the
  // cursor result can only have come from the block's own timestamp.
  const pastStamp = "2020-01-01T00:00:00Z";
  fs.writeFileSync(
    path.join(dir, "harvester.md"),
    `--- from: harvester  at: ${pastStamp}  hops: 0 ---\nold seed\n\n`,
  );

  const before = new Date();
  const read = run(cwd, ["read", "scorer"]);
  const after = new Date();
  assert.equal(read.status, 0);

  const cursor = fs.readFileSync(path.join(dir, ".cursor-harvester"), "utf8").trim();
  assert.equal(cursor, pastStamp);
  assert.ok(new Date(cursor) < before);
  assert.ok(new Date(cursor) < after);
});

test("a block appended after a read is caught on the next read", () => {
  const cwd = tmpRefinery();
  send(cwd, "scorer", { from: "harvester" }, "first seed");
  const firstRead = run(cwd, ["read", "scorer"]);
  assert.match(firstRead.stdout, /first seed/);

  send(cwd, "scorer", { from: "harvester" }, "second seed");
  const secondRead = run(cwd, ["read", "scorer"]);
  assert.doesNotMatch(secondRead.stdout, /first seed/);
  assert.match(secondRead.stdout, /second seed/);
});

test("peek prints unread mail but moves no cursor", () => {
  const cwd = tmpRefinery();
  send(cwd, "scorer", { from: "harvester" }, "a seed");

  const peeked = run(cwd, ["peek", "scorer"]);
  assert.match(peeked.stdout, /a seed/);
  assert.equal(fs.existsSync(path.join(cwd, "mail", "scorer", ".cursor-harvester")), false);

  const peekedAgain = run(cwd, ["peek", "scorer"]);
  assert.match(peekedAgain.stdout, /a seed/);
});

test("the hop guard blocks a 12-hop send to anyone but the overseer", () => {
  const cwd = tmpRefinery();
  const result = send(cwd, "refiner", { from: "challenger", hops: 12 }, "ping");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /escalate to overseer/);
  assert.equal(fs.existsSync(path.join(cwd, "mail", "refiner", "challenger.md")), false);
});

test("the hop guard allows a 12-hop send to the overseer", () => {
  const cwd = tmpRefinery();
  const result = send(cwd, "overseer", { from: "challenger", hops: 12 }, "escalating");
  assert.equal(result.status, 0);
  const body = fs.readFileSync(path.join(cwd, "mail", "overseer", "challenger.md"), "utf8");
  assert.match(body, /hops: 12/);
  assert.match(body, /escalating/);
});
