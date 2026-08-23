#!/usr/bin/env node
// src/embed.mjs — embeds text via the Voyage AI REST API.
//
// Reads a JSON array of strings on stdin, prints a JSON array of embedding
// vectors on stdout. Batches requests at BATCH_SIZE inputs per call.
//
// Usage: embed.mjs [--model <name>] [--stub]   (JSON array of strings on stdin)
//
// --stub skips the network and emits deterministic pseudo-vectors derived
// from a hash of each input's tokens, so callers (themes.mjs and its tests)
// can run offline while still seeing similar text land near each other.
//
// The API key never appears on stdout or stderr, including in error
// messages: every failure path below prints a fixed, key-free string.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "node:util";

const DEFAULT_MODEL = "voyage-3.5";
// Sized for per-minute token limits, not the API's 128-input maximum: a chunk runs
// ~600 tokens, so 16 per call stays inside entry-tier throughput with room to spare.
const BATCH_SIZE = 16;
const BATCH_PAUSE_MS = 1500;
const VOYAGE_URL = process.env.VOYAGE_API_URL || "https://api.voyageai.com/v1/embeddings";
const STUB_DIMENSIONS = 64;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseFlags(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      stub: { type: "boolean", default: false },
      model: { type: "string", default: DEFAULT_MODEL },
    },
  });
  return values;
}

function readKeyFromEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return null;
  const match = fs.readFileSync(envPath, "utf8").match(/^VOYAGE_API_KEY=(.*)$/m);
  if (!match) return null;
  const value = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  return value.length ? value : null;
}

function resolveKey() {
  return process.env.VOYAGE_API_KEY || readKeyFromEnvFile();
}

function tokenize(text) {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  return tokens && tokens.length ? tokens : [text];
}

// A per-token pseudo-random unit-ish vector, seeded from a hash of the
// token. Summing these over a pitch's tokens (bag-of-words) and
// normalising gives near-duplicate texts a high cosine similarity without
// calling the network. themes.mjs's clustering depends on that property
// when run with --stub.
function tokenVector(token) {
  const hash = crypto.createHash("sha256").update(token).digest();
  const vector = new Array(STUB_DIMENSIONS);
  for (let i = 0; i < STUB_DIMENSIONS; i++) {
    const byte = hash[(2 * i) % hash.length] ^ hash[(2 * i + 1) % hash.length];
    vector[i] = (byte / 255) * 2 - 1;
  }
  return vector;
}

function stubVector(text) {
  const dims = new Array(STUB_DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const tokenVec = tokenVector(token);
    for (let i = 0; i < STUB_DIMENSIONS; i++) dims[i] += tokenVec[i];
  }
  const norm = Math.sqrt(dims.reduce((sum, x) => sum + x * x, 0)) || 1;
  return dims.map((x) => x / norm);
}

async function embedBatch(inputs, model, key, attempt = 0) {
  let response;
  try {
    response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: inputs, model }),
    });
    // Rate limits and transient server errors get a bounded, growing backoff:
    // five retries spanning about a minute before the failure is real.
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      return embedBatch(inputs, model, key, attempt + 1);
    }
  } catch {
    fail("embed.mjs: request to the embeddings API failed");
  }
  if (!response.ok) {
    fail(`embed.mjs: embeddings API returned ${response.status}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    fail("embed.mjs: embeddings API returned an unparseable response");
  }
  return data.data.map((row) => row.embedding);
}

async function embedAll(inputs, model, key) {
  const vectors = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    vectors.push(...(await embedBatch(batch, model, key)));
    if (i + BATCH_SIZE < inputs.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }
  return vectors;
}

function readInputs() {
  const raw = fs.readFileSync(0, "utf8");
  let inputs;
  try {
    inputs = JSON.parse(raw);
  } catch {
    fail("embed.mjs: stdin was not valid JSON");
  }
  if (!Array.isArray(inputs)) fail("embed.mjs: stdin must be a JSON array of strings");
  return inputs;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const inputs = readInputs();

  if (flags.stub) {
    console.log(JSON.stringify(inputs.map(stubVector)));
    return;
  }

  const key = resolveKey();
  if (!key) fail("embed.mjs: no VOYAGE_API_KEY set and none found in .env");

  const vectors = await embedAll(inputs, flags.model, key);
  console.log(JSON.stringify(vectors));
}

main().catch(() => fail("embed.mjs: embedding failed"));
