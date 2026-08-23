#!/usr/bin/env node
// src/viz/server.mjs — the refinery viewer's read-only API.
//
// Every route is GET, every answer comes straight from the filesystem, and
// nothing here writes, deletes or shells out to anything that mutates.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parseFrontMatter, fmField, fmTags } from "../front-matter.mjs";

const DEFAULT_PORT = 4642;

// Lifecycle order. A bucket directory not listed here never appears in /api/state.
const BUCKETS = [
  "0-seeds",
  "1-scored",
  "2-contested",
  "3-refined",
  "4-ranked",
  "operator-selected",
  "operator-rejected",
  "killed",
  "archive",
];

const ARTIFACT_ROOTS = ["plans", "digests"];
const ARTIFACT_SINGLETONS = new Set(["RANKED.md", "THEMES.md"]);

const HEARTBEAT_MS = 15_000;
const DEBOUNCE_MS = 250;

// The route table, declared once, with nothing but shape: method and path.
// No handler lives here, so a test can enumerate it and prove every route
// is a GET without importing the runtime dispatcher's closures.
export const ROUTE_TABLE = [
  { method: "GET", path: "/api/state" },
  { method: "GET", path: "/api/idea/:id" },
  { method: "GET", path: "/api/agent/:name" },
  { method: "GET", path: "/api/mail" },
  { method: "GET", path: "/api/artifact/:name" },
  { method: "GET", path: "/api/artifacts" },
  { method: "GET", path: "/api/commits" },
  { method: "GET", path: "/events" },
  { method: "GET", path: "/assets/marked.js" },
  { method: "GET", path: "/" },
];

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// Matches a request path against ROUTE_TABLE's shapes and names which
// handler applies. Kept separate from ROUTE_TABLE itself so that table
// stays free of behaviour.
function matchRoute(pathname) {
  if (pathname === "/api/state") return { name: "state" };
  if (pathname === "/api/mail") return { name: "mail" };
  if (pathname === "/api/artifacts") return { name: "artifacts" };
  if (pathname === "/api/commits") return { name: "commits" };
  if (pathname === "/events") return { name: "events" };
  if (pathname === "/assets/marked.js") return { name: "marked" };
  if (pathname === "/") return { name: "index" };
  if (pathname.startsWith("/api/idea/")) {
    const rest = safeDecode(pathname.slice("/api/idea/".length));
    return rest ? { name: "idea", rest } : { name: "idea", rest: null };
  }
  if (pathname.startsWith("/api/agent/")) {
    const rest = safeDecode(pathname.slice("/api/agent/".length));
    return rest ? { name: "agent", rest } : { name: "agent", rest: null };
  }
  if (pathname.startsWith("/api/artifact/")) {
    const rest = safeDecode(pathname.slice("/api/artifact/".length));
    return rest ? { name: "artifact", rest } : { name: "artifact", rest: null };
  }
  return null;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

// ---- caps.json, STOP files, tmux liveness -------------------------------

function readCaps(root) {
  const file = path.join(root, "caps.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function agentNames(caps) {
  return Object.keys(caps).filter((key) => key !== "cliVersion");
}

function listStopFiles(root) {
  return fs
    .readdirSync(root)
    .filter((name) => name === "STOP" || name.startsWith("STOP."));
}

// Read-only shell-outs only: has-session, then list-windows. tmux's absence
// is not an error, it is a fact about the machine.
function tmuxState() {
  try {
    execFileSync("tmux", ["has-session", "-t", "refinery"], { stdio: "pipe" });
  } catch (error) {
    if (error.code === "ENOENT") {
      return { state: "unknown", detail: "unknown — tmux not found" };
    }
    return { state: "down", detail: "refinery session not running", windows: [] };
  }
  try {
    const out = execFileSync(
      "tmux",
      ["list-windows", "-t", "refinery", "-F", "#{window_index}:#{window_name}"],
      { encoding: "utf8", stdio: "pipe" },
    );
    const windows = out.split("\n").filter(Boolean);
    return { state: "running", windows, profile: tmuxProfile() };
  } catch {
    return { state: "running", windows: [], profile: tmuxProfile() };
  }
}

// refinery.sh starts every loop as "REFINERY_PROFILE=<profile> bash
// scripts/loop.sh <agent>", so the profile is readable from any pane's
// start command. Best effort: null when tmux cannot say.
function tmuxProfile() {
  try {
    const out = execFileSync(
      "tmux",
      ["list-panes", "-s", "-t", "refinery", "-F", "#{pane_start_command}"],
      { encoding: "utf8", stdio: "pipe" },
    );
    const match = out.match(/REFINERY_PROFILE=(sprint|cruise)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// The model tier a loop wake runs on, from the agent definition's front
// matter — the same file `claude -p --agent` reads.
function agentTier(root, agent) {
  const file = path.join(root, ".claude", "agents", `${agent}.md`);
  if (!fs.existsSync(file)) return null;
  const parsed = parseFrontMatter(fs.readFileSync(file, "utf8"));
  return parsed ? fmField(parsed.fm, "model") : null;
}

// ---- idea buckets and front matter ---------------------------------------

function listBucketIdeas(root, bucket) {
  const dir = path.join(root, `ideas-${bucket}`);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const parsed = parseFrontMatter(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!parsed) continue;
    out.push({
      id: fmField(parsed.fm, "id"),
      title: fmField(parsed.fm, "title"),
      status: fmField(parsed.fm, "status"),
      owner: fmField(parsed.fm, "owner"),
      score: fmField(parsed.fm, "score"),
      tags: fmTags(parsed.fm),
      updated: fmField(parsed.fm, "updated"),
    });
  }
  return out;
}

function latestLogEntry(root, agent) {
  const file = path.join(root, "logs", `${agent}.jsonl`);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

// A generic "key: value" reader for a front-matter block, plus the two
// fields that need their own shape: tags (a bracketed list) and
// score-breakdown (a brace object). Sources is the one indented-list field
// besides tags; it is read the same way tags would be if it used brackets.
function parseFmObject(fm) {
  const lines = fm.split("\n");
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(/^([\w-]+):\s?(.*)$/);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1];
    const value = match[2].trim();
    if (value === "" && lines[i + 1] && /^\s+-\s/.test(lines[i + 1])) {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s/.test(lines[j])) {
        items.push(lines[j].replace(/^\s+-\s/, "").trim());
        j += 1;
      }
      obj[key] = items;
      i = j;
      continue;
    }
    obj[key] = value;
    i += 1;
  }
  obj.tags = fmTags(fm);
  const breakdown = fmField(fm, "score-breakdown");
  if (breakdown) obj["score-breakdown"] = parseBraceObject(breakdown);
  return obj;
}

function parseBraceObject(raw) {
  const inner = raw.replace(/^\{/, "").replace(/\}\s*$/, "");
  const obj = {};
  for (const pair of inner.split(",")) {
    const [key, value] = pair.split(":").map((s) => (s ?? "").trim());
    if (!key) continue;
    const num = Number(value);
    obj[key] = Number.isNaN(num) ? value : num;
  }
  return obj;
}

function findIdeaFile(root, id) {
  if (!/^idea-\d{4}[a-z]?$/.test(id)) return null;
  for (const bucket of BUCKETS) {
    const dir = path.join(root, `ideas-${bucket}`);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === `${id}.md` || name.startsWith(`${id}-`)) {
        return { file: path.join(dir, name), bucket };
      }
    }
  }
  return null;
}

// ---- mail: mirrors src/mail.mjs's block grammar and cursor arithmetic ---

function parseMailBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const headerMatch = line.match(/^--- (.+) ---\s*$/);
    if (headerMatch) {
      if (current) blocks.push(finalizeMailBlock(current));
      const fields = {};
      for (const m of headerMatch[1].matchAll(/(\w+): (\S+)/g)) fields[m[1]] = m[2];
      current = { fields, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push(finalizeMailBlock(current));
  return blocks;
}

function finalizeMailBlock(current) {
  while (current.bodyLines.length && current.bodyLines[current.bodyLines.length - 1] === "") {
    current.bodyLines.pop();
  }
  return {
    from: current.fields.from,
    at: current.fields.at,
    re: current.fields.re ?? null,
    hops: current.fields.hops !== undefined ? Number(current.fields.hops) : 0,
    body: current.bodyLines.join("\n"),
  };
}

function mailCursor(dir, sender) {
  const file = path.join(dir, `.cursor-${sender}`);
  if (!fs.existsSync(file)) return null;
  const value = fs.readFileSync(file, "utf8").trim();
  return value.length ? value : null;
}

// ---- artifact path resolution ---------------------------------------------

// Resolves a requested artifact name to an absolute path inside exactly
// RANKED.md, THEMES.md, plans/ or digests/ — or null when it points
// anywhere else, including via ../ traversal.
function resolveArtifactPath(root, name) {
  if (name === null || name.includes("\0")) return null;
  if (ARTIFACT_SINGLETONS.has(name)) return path.join(root, name);

  const parts = name.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [top, ...rest] = parts;
  if (!ARTIFACT_ROOTS.includes(top)) return null;

  const dir = path.resolve(root, top);
  const target = path.resolve(dir, rest.join("/"));
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  return target;
}

// ---- git log ---------------------------------------------------------------

function readCommits(root) {
  let out = "";
  try {
    out = execFileSync("git", ["log", "--oneline", "-40"], { cwd: root, encoding: "utf8", stdio: "pipe" });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s(.*)$/);
      return match ? { hash: match[1], subject: match[2] } : { hash: line, subject: "" };
    });
}

// Derives a {hash} commit-URL template from `git remote get-url origin`, for
// GitLab and GitHub, ssh or https form. Null when there is no origin or the
// host is neither — the client then renders the hash unlinked.
function readCommitUrlTemplate(root) {
  let url = "";
  try {
    url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
  if (!url) return null;

  let host = null;
  let repoPath = null;
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    host = sshMatch[1];
    repoPath = sshMatch[2];
  } else {
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      repoPath = parsed.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }
  if (!host || !repoPath) return null;
  repoPath = repoPath.replace(/\.git$/, "").replace(/\/+$/, "");
  if (!repoPath) return null;

  if (host === "gitlab.com") return `https://gitlab.com/${repoPath}/-/commit/{hash}`;
  if (host === "github.com") return `https://github.com/${repoPath}/commit/{hash}`;
  return null;
}

// ---- SSE change classification --------------------------------------------

// Which panel a changed relative path belongs to, or null when it is
// nothing the viewer watches (fs.watch reports every touch in a watched
// tree, most of them irrelevant to any panel).
function classifyChange(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized.startsWith("ideas-")) return "ideas";
  if (normalized === "mail" || normalized.startsWith("mail/")) return "mail";
  if (normalized === "logs" || normalized.startsWith("logs/")) return "agents";
  if (normalized === "plans" || normalized.startsWith("plans/")) return "artifact";
  if (normalized === "digests" || normalized.startsWith("digests/")) return "artifact";
  if (normalized === "RANKED.md" || normalized === "THEMES.md") return "artifact";
  if (normalized === "caps.json") return "state";
  if (normalized === "STOP" || normalized.startsWith("STOP.")) return "state";
  return null;
}

function watchDirTargets(root) {
  return [...BUCKETS.map((bucket) => `ideas-${bucket}`), "mail", "logs", "plans", "digests"]
    .map((rel) => ({ rel, dir: path.join(root, rel) }))
    .filter(({ dir }) => fs.existsSync(dir));
}

// One watcher per existing target directory, plus one non-recursive watch
// on root for the loose top-level files (RANKED.md, THEMES.md, caps.json,
// STOP*). A directory created after the server starts is picked up only on
// restart — the client's periodic full refresh (V1) covers that gap.
function setupWatchers(root, onChange) {
  const watchers = [];

  for (const { rel, dir } of watchDirTargets(root)) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
        onChange(filename ? path.join(rel, filename) : rel);
      });
      watchers.push(watcher);
    } catch {
      // Best effort: a platform without recursive watch support just
      // misses this directory rather than crashing the server.
    }
  }

  try {
    const rootWatcher = fs.watch(root, (_event, filename) => {
      if (filename && classifyChange(filename) === "state") onChange(filename);
    });
    watchers.push(rootWatcher);
  } catch {
    // no-op
  }

  return () => {
    for (const watcher of watchers) watcher.close();
  };
}

// ---- route handlers ---------------------------------------------------------

function handleState(root, res) {
  const caps = readCaps(root);
  const buckets = {};
  for (const bucket of BUCKETS) buckets[bucket] = listBucketIdeas(root, bucket);
  const agentLogs = {};
  const tiers = {};
  for (const agent of agentNames(caps)) {
    agentLogs[agent] = latestLogEntry(root, agent);
    tiers[agent] = agentTier(root, agent);
  }

  sendJson(res, 200, {
    root,
    buckets,
    caps,
    tiers,
    stop: listStopFiles(root),
    tmux: tmuxState(),
    agentLogs,
  });
}

function handleIdea(root, res, id) {
  if (!id) return sendJson(res, 400, { error: "missing idea id" });
  const found = findIdeaFile(root, id);
  if (!found) return sendJson(res, 404, { error: `idea not found: ${id}` });

  const raw = fs.readFileSync(found.file, "utf8");
  const parsed = parseFrontMatter(raw);
  sendJson(res, 200, {
    id,
    bucket: found.bucket,
    file: path.basename(found.file),
    raw,
    fm: parsed ? parseFmObject(parsed.fm) : null,
    body: parsed ? parsed.body : raw,
  });
}

function handleAgent(root, res, name) {
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
    return sendJson(res, 400, { error: "bad agent name" });
  }

  const logFile = path.join(root, "logs", `${name}.jsonl`);
  const errFile = path.join(root, "logs", `${name}.err`);
  const lines = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean)
    : [];
  const entries = lines
    .slice(-50)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const errTail = fs.existsSync(errFile)
    ? fs.readFileSync(errFile, "utf8").split("\n").filter(Boolean).slice(-40)
    : [];

  const today = new Date().toISOString().slice(0, 10);
  let wakesToday = 0;
  let costToday = 0;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const stamp = typeof entry.loggedAt === "string" ? entry.loggedAt.slice(0, 10) : null;
    if (stamp !== today) continue;
    wakesToday += 1;
    costToday += Number(entry.total_cost_usd) || 0;
  }

  const caps = readCaps(root);
  sendJson(res, 200, {
    agent: name,
    log: entries,
    errTail,
    wakesToday,
    costToday,
    caps: caps[name] ?? null,
  });
}

function handleMail(root, res) {
  const mailRoot = path.join(root, "mail");
  const out = {};
  if (fs.existsSync(mailRoot)) {
    for (const entry of fs.readdirSync(mailRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "archive") continue;
      const dir = path.join(mailRoot, entry.name);
      const senders = {};
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".md")) continue;
        const sender = name.slice(0, -3);
        const blocks = parseMailBlocks(fs.readFileSync(path.join(dir, name), "utf8"));
        const cursor = mailCursor(dir, sender);
        const unread = cursor ? blocks.filter((b) => b.at > cursor).length : blocks.length;
        senders[sender] = { unread, last: blocks.slice(-5) };
      }
      out[entry.name] = senders;
    }
  }
  sendJson(res, 200, { mail: out });
}

function handleArtifact(root, res, name) {
  const target = resolveArtifactPath(root, name);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return sendJson(res, 404, { error: `artifact not found: ${name}` });
  }
  sendText(res, 200, fs.readFileSync(target, "utf8"), "text/markdown; charset=utf-8");
}

function handleCommits(root, res) {
  sendJson(res, 200, { commits: readCommits(root), commitUrlTemplate: readCommitUrlTemplate(root) });
}

// The listings behind the plans and digests tabs: file names only, plus a
// plan's own "Status:" line so it can surface on the card. RANKED.md and
// THEMES.md report bare existence — a missing one is an honest gap the
// page words itself.
function listArtifactDir(root, dirName, withStatus) {
  const dir = path.join(root, dirName);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const entry = { name };
    if (withStatus) {
      const match = fs.readFileSync(path.join(dir, name), "utf8").match(/^Status:\s*(.+)$/m);
      if (match) entry.status = match[1].trim();
    }
    out.push(entry);
  }
  return out;
}

function handleArtifacts(root, res) {
  sendJson(res, 200, {
    ranked: fs.existsSync(path.join(root, "RANKED.md")),
    themes: fs.existsSync(path.join(root, "THEMES.md")),
    plans: listArtifactDir(root, "plans", true),
    digests: listArtifactDir(root, "digests", false).reverse(),
  });
}

// The page's one library, served from this repository's own node_modules —
// the browser never fetches beyond localhost.
function markedFile() {
  try {
    const require = createRequire(import.meta.url);
    const pkgDir = path.dirname(require.resolve("marked/package.json"));
    return path.join(pkgDir, "lib", "marked.umd.js");
  } catch {
    return null;
  }
}

function handleMarked(res) {
  const file = markedFile();
  if (!file || !fs.existsSync(file)) {
    return sendText(res, 500, "marked is not installed — run npm install\n");
  }
  sendText(res, 200, fs.readFileSync(file, "utf8"), "text/javascript; charset=utf-8");
}

const PAGE_FILE = path.join(import.meta.dirname, "page.html");

function handleIndex(res) {
  if (!fs.existsSync(PAGE_FILE)) {
    return sendText(res, 500, "page.html is missing next to server.mjs\n");
  }
  sendText(res, 200, fs.readFileSync(PAGE_FILE, "utf8"), "text/html; charset=utf-8");
}

function handleEvents(res, sseClients) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  sseClients.add(res);
  res.on("close", () => sseClients.delete(res));
}

// ---- server assembly ---------------------------------------------------------

export function createServer(root) {
  const sseClients = new Set();
  const pending = new Map();
  let debounceTimer = null;

  function broadcast(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) res.write(data);
  }

  function flushPending() {
    debounceTimer = null;
    const events = [...pending.values()];
    pending.clear();
    for (const event of events) broadcast(event);
  }

  function onChange(relPath) {
    const area = classifyChange(relPath);
    if (!area) return;
    pending.set(`${area}:${relPath}`, { area, path: relPath });
    if (!debounceTimer) {
      debounceTimer = setTimeout(flushPending, DEBOUNCE_MS);
      debounceTimer.unref();
    }
  }

  const closeWatchers = setupWatchers(root, onChange);

  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(": heartbeat\n\n");
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://127.0.0.1");
    const match = matchRoute(pathname);
    if (!match) return sendText(res, 404, "404 not found");
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      return res.end("405 method not allowed");
    }

    switch (match.name) {
      case "state":
        return handleState(root, res);
      case "idea":
        return handleIdea(root, res, match.rest);
      case "agent":
        return handleAgent(root, res, match.rest);
      case "mail":
        return handleMail(root, res);
      case "artifact":
        return handleArtifact(root, res, match.rest);
      case "artifacts":
        return handleArtifacts(root, res);
      case "commits":
        return handleCommits(root, res);
      case "marked":
        return handleMarked(res);
      case "events":
        return handleEvents(res, sseClients);
      case "index":
        return handleIndex(res);
      default:
        return sendText(res, 404, "404 not found");
    }
  });

  server.on("close", () => {
    closeWatchers();
    clearInterval(heartbeat);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const res of sseClients) {
      try {
        res.end();
      } catch {
        // the socket may already be gone, e.g. after closeAllConnections()
      }
    }
    sseClients.clear();
  });

  return server;
}

function main() {
  const { values } = parseArgs({ options: { port: { type: "string" } }, allowPositionals: true });
  const port = values.port ? Number(values.port) : DEFAULT_PORT;
  const root = process.cwd();
  const server = createServer(root);
  server.listen(port, "127.0.0.1", () => {
    console.log(`viz: http://127.0.0.1:${port} (read-only, watching ${root})`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
