#!/usr/bin/env node
// src/mail.mjs — the one owner of refinery mail mechanics.
//
// mail/<recipient>/<sender>.md holds an append-only list of message blocks
// from that sender. mail/<recipient>/.cursor-<sender> holds the timestamp of
// the newest block a "read" has ever printed for that sender. Only this
// script writes either kind of file.
//
// Usage:
//   mail.mjs send <recipient> --from <agent> [--re <id>] [--hops <n>]   (body on stdin)
//   mail.mjs read <agent>
//   mail.mjs peek <agent>
//   mail.mjs rotate [--days <n>]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const HOP_CAP = 12;
const MAIL_ROOT = path.resolve(process.cwd(), "mail");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseCliArgs(args, options) {
  try {
    return parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    fail(error.message);
  }
}

function senderFile(recipient, sender) {
  return path.join(MAIL_ROOT, recipient, `${sender}.md`);
}

function cursorFile(recipient, sender) {
  return path.join(MAIL_ROOT, recipient, `.cursor-${sender}`);
}

function formatBlock({ from, at, re, hops }, body) {
  const fields = [`from: ${from}`, `at: ${at}`];
  if (re) fields.push(`re: ${re}`);
  fields.push(`hops: ${hops}`);
  const header = `--- ${fields.join("  ")} ---`;
  return `${header}\n${body}\n\n`;
}

// A block is a header line "--- key: value  key: value ... ---" followed by
// its body, running until the next header line or end of file.
function parseBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const headerMatch = line.match(/^--- (.+) ---\s*$/);
    if (headerMatch) {
      if (current) blocks.push(finalizeBlock(current));
      const fields = {};
      for (const m of headerMatch[1].matchAll(/(\w+): (\S+)/g)) {
        fields[m[1]] = m[2];
      }
      current = { fields, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push(finalizeBlock(current));
  return blocks;
}

function finalizeBlock(current) {
  while (
    current.bodyLines.length &&
    current.bodyLines[current.bodyLines.length - 1] === ""
  ) {
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

function readBlocks(recipient, sender) {
  const file = senderFile(recipient, sender);
  if (!fs.existsSync(file)) return [];
  return parseBlocks(fs.readFileSync(file, "utf8"));
}

function getCursor(recipient, sender) {
  const file = cursorFile(recipient, sender);
  if (!fs.existsSync(file)) return null;
  const value = fs.readFileSync(file, "utf8").trim();
  return value.length ? value : null;
}

function setCursor(recipient, sender, at) {
  const file = cursorFile(recipient, sender);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${at}\n`);
}

function listSenders(recipient) {
  const dir = path.join(MAIL_ROOT, recipient);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
}

function cmdSend(recipient, flags, body) {
  const from = flags.from;
  if (!from) fail("send requires --from <agent>");

  const hops = flags.hops !== undefined ? Number(flags.hops) : 0;
  if (hops >= HOP_CAP && recipient !== "overseer") {
    fail(
      `hop cap reached (${hops} >= ${HOP_CAP}) for ${recipient}; escalate to overseer instead of replying`,
    );
  }

  const re = flags.re ?? null;
  // Cursor arithmetic depends on strictly increasing timestamps within a
  // sender file; two sends inside the same clock second must not collide,
  // or the reader's ">" comparison would silently treat the second as
  // already read.
  const previous = readBlocks(recipient, from);
  const lastAt = previous.length ? previous[previous.length - 1].at : null;
  const at = lastAt && nowIso() <= lastAt ? bumpTimestamp(lastAt) : nowIso();
  const block = formatBlock({ from, at, re, hops }, body.replace(/\s+$/, ""));

  const file = senderFile(recipient, from);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, block);
}

function bumpTimestamp(at) {
  return new Date(new Date(at).getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function cmdReadOrPeek(agent, { advance }) {
  const senders = listSenders(agent);
  let printedAny = false;

  for (const sender of senders) {
    const blocks = readBlocks(agent, sender);
    const cursor = getCursor(agent, sender);
    const unread = cursor ? blocks.filter((b) => b.at > cursor) : blocks;
    if (unread.length === 0) continue;

    console.log(`=== ${sender} ===`);
    for (const b of unread) {
      const fields = [`from: ${b.from}`, `at: ${b.at}`];
      if (b.re) fields.push(`re: ${b.re}`);
      fields.push(`hops: ${b.hops}`);
      console.log(`--- ${fields.join("  ")} ---`);
      console.log(b.body);
      console.log("");
      printedAny = true;
    }

    if (advance) {
      const newest = unread.reduce((max, b) => (b.at > max ? b.at : max), unread[0].at);
      setCursor(agent, sender, newest);
    }
  }

  if (!printedAny) console.log("no unread mail");
}

const ROTATE_DEFAULT_DAYS = 14;

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

// Splits a sender file's raw text into per-block character spans rather than
// reparsing and reformatting, so a block that stays put or moves to the
// archive keeps its exact original bytes.
function splitRawBlocks(text) {
  const headerRe = /^--- (.+) ---[ \t\r]*$/gm;
  const matches = [...text.matchAll(headerRe)];
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const fields = {};
    for (const m of matches[i][1].matchAll(/(\w+): (\S+)/g)) fields[m[1]] = m[2];
    blocks.push({ at: fields.at ?? null, raw: text.slice(start, end) });
  }
  return blocks;
}

function cmdRotate(days) {
  if (!fs.existsSync(MAIL_ROOT)) return;
  const cutoff = daysAgoIso(days);

  const recipients = fs
    .readdirSync(MAIL_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "archive")
    .map((d) => d.name);

  for (const recipient of recipients) {
    const recipientDir = path.join(MAIL_ROOT, recipient);
    const senderFiles = fs
      .readdirSync(recipientDir)
      .filter((name) => name.endsWith(".md"));

    for (const fileName of senderFiles) {
      const sender = fileName.slice(0, -3);
      const cursor = getCursor(recipient, sender);
      if (!cursor) continue; // nothing read yet: nothing is eligible

      const filePath = path.join(recipientDir, fileName);
      const blocks = splitRawBlocks(fs.readFileSync(filePath, "utf8"));

      const keep = [];
      const byMonth = new Map();
      for (const block of blocks) {
        const eligible = block.at && block.at <= cursor && block.at < cutoff;
        if (!eligible) {
          keep.push(block);
          continue;
        }
        const yyyymm = block.at.slice(0, 7).replace("-", "");
        if (!byMonth.has(yyyymm)) byMonth.set(yyyymm, []);
        byMonth.get(yyyymm).push(block);
      }
      if (byMonth.size === 0) continue;

      const archiveDir = path.join(MAIL_ROOT, "archive", recipient);
      fs.mkdirSync(archiveDir, { recursive: true });
      for (const [yyyymm, monthBlocks] of byMonth) {
        const archiveFile = path.join(archiveDir, `${sender}-${yyyymm}.md`);
        fs.appendFileSync(archiveFile, monthBlocks.map((b) => b.raw).join(""));
      }

      fs.writeFileSync(filePath, keep.map((b) => b.raw).join(""));
    }
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;

  if (cmd === "send") {
    const { values: flags, positionals } = parseCliArgs(rest, {
      from: { type: "string" },
      re: { type: "string" },
      hops: { type: "string" },
    });
    const recipient = positionals[0];
    if (!recipient) fail("send requires a recipient");
    const body = fs.readFileSync(0, "utf8");
    cmdSend(recipient, flags, body);
    return;
  }

  if (cmd === "read" || cmd === "peek") {
    const agent = rest[0];
    if (!agent) fail(`${cmd} requires an agent`);
    cmdReadOrPeek(agent, { advance: cmd === "read" });
    return;
  }

  if (cmd === "rotate") {
    const { values: flags } = parseCliArgs(rest, { days: { type: "string" } });
    const days = flags.days !== undefined ? Number(flags.days) : ROTATE_DEFAULT_DAYS;
    cmdRotate(days);
    return;
  }

  fail("usage: mail.mjs <send|read|peek|rotate> ...");
}

main();
