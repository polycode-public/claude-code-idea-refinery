#!/usr/bin/env node
// src/budget.mjs — the refinery's circuit breaker.
//
// Reads and writes logs/<agent>.jsonl (one claude -p JSON result per line,
// stamped with a UTC timestamp on the way in) and the repo-root caps.json
// (the per-agent dollar, wake-count and interval caps).
//
// Usage:
//   budget.mjs log <agent>        (claude -p JSON result on stdin)
//   budget.mjs check <agent>
//   budget.mjs wake-cap <agent>
//   budget.mjs interval <agent>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CAPS_FILE = path.join(SCRIPT_DIR, "..", "caps.json");
const LOGS_DIR = path.resolve(process.cwd(), "logs");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function logFile(agent) {
  return path.join(LOGS_DIR, `${agent}.jsonl`);
}

function loadCaps() {
  return JSON.parse(fs.readFileSync(CAPS_FILE, "utf8"));
}

function agentCaps(agent) {
  const caps = loadCaps();
  const row = caps[agent];
  if (!row) fail(`no caps entry for agent "${agent}"`);
  return row;
}

function cmdLog(agent) {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return; // a failed wake logs nothing

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    console.error("budget log: stdin was not valid JSON, skipping");
    process.exitCode = 1;
    return;
  }

  result.loggedAt = nowIso();
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(logFile(agent), `${JSON.stringify(result)}\n`);
}

function cmdCheck(agent) {
  const file = logFile(agent);
  if (!fs.existsSync(file)) process.exit(0);

  const row = agentCaps(agent);
  const today = todayUtc();
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);

  let wakes = 0;
  let cost = 0;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const stamp = typeof entry.loggedAt === "string" ? entry.loggedAt.slice(0, 10) : null;
    if (stamp !== today) continue;
    wakes += 1;
    cost += Number(entry.total_cost_usd) || 0;
  }

  if (wakes >= row.dailyWakes || cost >= row.dailyUsd) process.exit(1);
  process.exit(0);
}

function cmdWakeCap(agent) {
  console.log(agentCaps(agent).wakeUsd);
}

function cmdInterval(agent) {
  const row = agentCaps(agent);
  const cruise = process.env.REFINERY_PROFILE === "cruise";
  console.log(cruise ? row.cruiseSeconds : row.sprintSeconds);
}

function main() {
  const [, , cmd, agent] = process.argv;
  if (!agent) fail("usage: budget.mjs <log|check|wake-cap|interval> <agent>");

  switch (cmd) {
    case "log":
      cmdLog(agent);
      break;
    case "check":
      cmdCheck(agent);
      break;
    case "wake-cap":
      cmdWakeCap(agent);
      break;
    case "interval":
      cmdInterval(agent);
      break;
    default:
      fail("usage: budget.mjs <log|check|wake-cap|interval> <agent>");
  }
}

main();
