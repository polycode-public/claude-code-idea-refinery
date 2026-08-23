import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(TEST_DIR, "..", "src", "embed.mjs");
const PITCHES = JSON.parse(fs.readFileSync(path.join(TEST_DIR, "fixtures", "pitches.json"), "utf8"));

function tmpCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "embed-test-"));
}

function run(args, { cwd, input, env, timeout } = {}) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: cwd ?? tmpCwd(),
    input: input ?? "",
    encoding: "utf8",
    env: env ?? process.env,
    timeout: timeout ?? 5000,
  });
}

test("--stub output is deterministic and shape-matches the input count", () => {
  const first = run(["--stub"], { input: JSON.stringify(PITCHES) });
  const second = run(["--stub"], { input: JSON.stringify(PITCHES) });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);

  const vectors = JSON.parse(first.stdout);
  assert.equal(vectors.length, PITCHES.length);
  for (const vector of vectors) {
    assert.ok(Array.isArray(vector));
    assert.ok(vector.length > 0);
    assert.ok(vector.every((component) => typeof component === "number"));
  }
});

test("a missing key without --stub exits non-zero without touching the network", () => {
  const cwd = tmpCwd();
  const env = { ...process.env };
  delete env.VOYAGE_API_KEY;
  // Point at an unroutable address. If the code reached fetch() before the
  // key check, this run would hang until the timeout below instead of
  // exiting immediately. That is how the assertion proves no request was
  // ever attempted.
  env.VOYAGE_API_URL = "http://10.255.255.1/v1/embeddings";

  const result = run([], { cwd, input: JSON.stringify(["one pitch"]), env, timeout: 3000 });

  assert.equal(result.signal, null, "process should exit on its own, not be killed by the timeout");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /VOYAGE_API_KEY/);
});

test("the key never appears on stdout or stderr, even when the request fails", async () => {
  const secret = "fake-key-should-never-leak-93af7c";
  let receivedAuth = null;

  const server = http.createServer((req, res) => {
    receivedAuth = req.headers.authorization;
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const env = {
      ...process.env,
      VOYAGE_API_KEY: secret,
      VOYAGE_API_URL: `http://127.0.0.1:${port}/v1/embeddings`,
    };
    // spawnSync would block this process's event loop, and the server
    // above lives in this same process. It could never accept the
    // child's connection. Use async spawn instead so the server can
    // answer while we wait for the child to exit.
    const result = await new Promise((resolve, reject) => {
      const child = spawn("node", [SCRIPT], { cwd: tmpCwd(), env });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(["one pitch"]));
    });

    // Proves the real (non-stub) request path ran, with the key attached,
    // rather than the assertion passing only because nothing was sent.
    assert.equal(receivedAuth, `Bearer ${secret}`);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  } finally {
    server.close();
  }
});
