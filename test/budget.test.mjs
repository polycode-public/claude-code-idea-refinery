import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "budget.mjs");

function tmpRefinery() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
}

function run(cwd, args, input, env) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd,
    input: input ?? "",
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function writeLogLine(cwd, agent, entry) {
  const dir = path.join(cwd, "logs");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${agent}.jsonl`), `${JSON.stringify(entry)}\n`);
}

test("log stamps the result with a UTC timestamp and preserves the original fields", () => {
  const cwd = tmpRefinery();
  const result = run(cwd, ["log", "scorer"], JSON.stringify({ total_cost_usd: 0.42, num_turns: 5, session_id: "s1" }));
  assert.equal(result.status, 0);

  const lines = fs.readFileSync(path.join(cwd, "logs", "scorer.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.total_cost_usd, 0.42);
  assert.equal(entry.num_turns, 5);
  assert.equal(entry.session_id, "s1");
  assert.match(entry.loggedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("log writes nothing for an empty result (a failed wake logs nothing)", () => {
  const cwd = tmpRefinery();
  const result = run(cwd, ["log", "scorer"], "");
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, "logs", "scorer.jsonl")), false);
});

test("check sums only today's UTC lines, ignoring entries from other days", () => {
  const cwd = tmpRefinery();
  const today = new Date().toISOString().slice(0, 10);
  writeLogLine(cwd, "scorer", { total_cost_usd: 4.9, loggedAt: `${today}T01:00:00Z` });
  writeLogLine(cwd, "scorer", { total_cost_usd: 4.9, loggedAt: "2000-01-01T01:00:00Z" });

  const result = run(cwd, ["check", "scorer"]);
  // 4.9 today is under the 5.00 daily cap. The 2000-01-01 line must not count.
  assert.equal(result.status, 0);
});

test("check exits non-zero once today's cost meets or exceeds the daily cap", () => {
  const cwd = tmpRefinery();
  const today = new Date().toISOString().slice(0, 10);
  writeLogLine(cwd, "scorer", { total_cost_usd: 5.0, loggedAt: `${today}T01:00:00Z` });

  const result = run(cwd, ["check", "scorer"]);
  assert.equal(result.status, 1);
});

test("check exits non-zero once today's wake count meets the daily wake cap", () => {
  const cwd = tmpRefinery();
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 60; i++) {
    writeLogLine(cwd, "ranker", { total_cost_usd: 0, loggedAt: `${today}T00:${String(i % 60).padStart(2, "0")}:00Z` });
  }

  const result = run(cwd, ["check", "ranker"]);
  assert.equal(result.status, 1);
});

test("check passes when a log file is missing entirely", () => {
  const cwd = tmpRefinery();
  const result = run(cwd, ["check", "scorer"]);
  assert.equal(result.status, 0);
});

test("wake-cap reads the per-wake USD bound from caps.json", () => {
  const cwd = tmpRefinery();
  const result = run(cwd, ["wake-cap", "scorer"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "0.75");
});

test("interval prints sprintSeconds by default and cruiseSeconds under REFINERY_PROFILE=cruise", () => {
  const cwd = tmpRefinery();
  const sprint = run(cwd, ["interval", "scorer"]);
  assert.equal(sprint.stdout.trim(), "120");

  const cruise = run(cwd, ["interval", "scorer"], "", { REFINERY_PROFILE: "cruise" });
  assert.equal(cruise.stdout.trim(), "600");
});
