import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../mcp/server.mjs", import.meta.url));

/**
 * Drive the server over stdio the way a real client would: write requests,
 * collect replies, close stdin. Returns parsed stdout lines plus raw stderr.
 */
function session(requests, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [SERVER], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);

    proc.on("close", (code) => {
      const lines = stdout.split("\n").filter((l) => l.trim());
      let messages;
      try {
        messages = lines.map((l) => JSON.parse(l));
      } catch (err) {
        return reject(
          new Error(`stdout was not pure JSON-RPC: ${err.message}\n${stdout}`),
        );
      }
      resolve({ messages, stderr, code });
    });

    for (const r of requests) proc.stdin.write(JSON.stringify(r) + "\n");
    proc.stdin.end();
  });
}

const call = (args, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "define_behavior", arguments: args },
});

describe("protocol contract", () => {
  test("initialize advertises name and tool capability", async () => {
    const { messages } = await session([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    ]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].result.serverInfo.name, "prespec");
    assert.ok(messages[0].result.capabilities.tools);
    assert.ok(messages[0].result.protocolVersion);
  });

  test("stdout carries only protocol traffic", async () => {
    // A stray console.log anywhere in the load path corrupts the stream and
    // the client fails in a way that points nowhere near the cause.
    const { messages, stderr } = await session([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);
    assert.equal(messages.length, 1);
    assert.match(stderr, /loaded/, "startup log should go to stderr");
  });

  test("notifications get no reply", async () => {
    const { messages } = await session([
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 7, method: "tools/list" },
    ]);
    assert.equal(messages.length, 1, "a notification was answered");
    assert.equal(messages[0].id, 7);
  });

  test("responses echo the request id", async () => {
    const { messages } = await session([
      { jsonrpc: "2.0", id: 41, method: "tools/list" },
      call({ feature_description: "order history" }, 42),
    ]);
    assert.deepEqual(
      messages.map((m) => m.id),
      [41, 42],
    );
  });

  test("exits cleanly when stdin closes", async () => {
    const { code } = await session([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);
    assert.equal(code, 0);
  });
});

describe("failure handling", () => {
  test("unknown method returns method-not-found, does not die", async () => {
    const { messages } = await session([
      { jsonrpc: "2.0", id: 1, method: "does/not/exist" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    assert.equal(messages[0].error.code, -32601);
    assert.ok(messages[1].result.tools, "server stopped serving after an error");
  });

  test("unknown tool name is rejected", async () => {
    const { messages } = await session([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "definitely_not_a_tool", arguments: {} },
      },
    ]);
    assert.equal(messages[0].error.code, -32602);
  });

  test("missing and blank required argument are both rejected", async () => {
    const { messages } = await session([
      call({}, 1),
      call({ feature_description: "   " }, 2),
    ]);
    for (const m of messages) {
      assert.ok(m.error, `expected rejection, got ${JSON.stringify(m.result)}`);
      assert.equal(m.error.code, -32602);
    }
  });

  test("malformed JSON is ignored and the session continues", async () => {
    // There is no id to reply to, so silence is correct — but the connection
    // must survive it.
    const proc = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));

    proc.stdin.write("{not json at all\n");
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) + "\n");
    proc.stdin.end();

    await new Promise((r) => proc.on("close", r));
    const messages = stdout.split("\n").filter(Boolean).map(JSON.parse);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 9);
  });

  test("empty lines are ignored", async () => {
    const proc = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stdin.write("\n\n   \n");
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }) + "\n");
    proc.stdin.end();
    await new Promise((r) => proc.on("close", r));
    assert.equal(stdout.split("\n").filter(Boolean).length, 1);
  });
});

describe("tool output", () => {
  test("tools/list describes define_behavior with its schema", async () => {
    const { messages } = await session([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);
    const [tool] = messages[0].result.tools;
    assert.equal(tool.name, "define_behavior");
    assert.deepEqual(tool.inputSchema.required, ["feature_description"]);
    assert.ok(tool.description.length > 80, "description too thin to route on");
  });

  test("call returns parseable content in the documented shape", async () => {
    const { messages } = await session([
      call({ feature_description: "users can browse their order history", side: "backend" }),
    ]);
    const payload = JSON.parse(messages[0].result.content[0].text);

    for (const key of ["matched_domains", "spec", "open_questions", "assumed_defaults", "gaps"]) {
      assert.ok(key in payload, `missing key: ${key}`);
    }
    assert.ok(Array.isArray(payload.spec));
    assert.ok(payload.spec[0].section && Array.isArray(payload.spec[0].cases));
  });

  test("works from any working directory", async () => {
    // The documented install runs the server by absolute path from wherever
    // the client happens to be. Bank loading must not depend on cwd.
    const { messages } = await session(
      [call({ feature_description: "order history", side: "backend" })],
      { cwd: "/tmp" },
    );
    const payload = JSON.parse(messages[0].result.content[0].text);
    assert.ok(payload.spec.length > 0, "bank not found when cwd was elsewhere");
  });
});
