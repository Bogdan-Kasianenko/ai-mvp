import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "./storage.mjs";
import { createChatSessionStore } from "./chat-session.mjs";
import { createChatHandler } from "./chat-route.mjs";

const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
function harness(repo) {
  let calls = 0;
  let behavior = async () => ({ kind: "unavailable" });
  const handler = createChatHandler({
    getSession: createChatSessionStore({ repository: repo }),
    loadCompanyData: async () => company,
    replyToMessage: (...args) => { calls++; return behavior(...args); },
    sendConfirmation: () => { throw new Error("Unexpected email attempt"); },
  });
  return {
    get calls() { return calls; },
    set behavior(value) { behavior = value; },
    async call(ip = "test", cookie = "") {
      const response = new EventEmitter();
      response.code = 200;
      response.cookie = (_name, value) => { response.id = value; };
      response.set = () => response;
      response.status = code => { response.code = code; return response; };
      response.json = body => { response.body = body; response.writableEnded = true; return response; };
      await handler({ body: { message: "test" }, headers: { cookie: cookie ? `caro_session=${cookie}` : "" }, ip, secure: false }, response);
      return response;
    },
  };
}

test("IP quota covers new cookies and persists after repository restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caro-rate-"));
  const path = join(dir, "test.sqlite");
  let repo = createRepository(path);
  try {
    let h = harness(repo);
    for (let i = 0; i < 30; i++) assert.notEqual((await h.call()).code, 429);
    assert.equal(h.calls, 30);
    repo.close();
    repo = createRepository(path);
    h = harness(repo);
    assert.equal((await h.call()).code, 429);
    assert.equal(h.calls, 0);
    assert.notEqual((await h.call("different-ip")).code, 429);
    assert.equal(h.calls, 1);
  } finally { repo.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("global quota blocks the 121st model call across different IPs", async () => {
  const repo = createRepository();
  try {
    const h = harness(repo);
    for (let i = 0; i < 120; i++) assert.notEqual((await h.call(`ip-${i}`)).code, 429);
    assert.equal((await h.call("new-ip")).code, 429);
    assert.equal(h.calls, 120);
    assert.equal(repo.activeCount(), 0);
  } finally { repo.close(); }
});

test("twelve active model calls exclude another chat; completing them restores capacity", async () => {
  const repo = createRepository();
  const pending = [];
  const gates = [];
  try {
    const h = harness(repo);
    h.behavior = () => new Promise(resolve => gates.push(resolve));
    for (let i = 0; i < 12; i++) pending.push(h.call(`ip-${i}`));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls, 12);
    assert.equal((await h.call("extra-ip")).code, 429);
    assert.equal(h.calls, 12);
    for (const resolve of gates) resolve({ kind: "unavailable" });
    await Promise.all(pending);
    assert.equal(repo.activeCount(), 0);
    h.behavior = async () => ({ kind: "unavailable" });
    assert.notEqual((await h.call("extra-ip")).code, 429);
    assert.equal(h.calls, 13);
  } finally {
    for (const resolve of gates) resolve({ kind: "unavailable" });
    await Promise.allSettled(pending);
    repo.close();
  }
});

test("model exceptions release the session lock for the next attempt", async () => {
  const repo = createRepository();
  try {
    const h = harness(repo);
    const initial = await h.call();
    h.behavior = async () => { throw new Error("Mock model failure"); };
    await assert.rejects(h.call("test", initial.id), /Mock model failure/);
    assert.equal(repo.activeCount(), 0);
    h.behavior = async () => ({ kind: "unavailable" });
    assert.notEqual((await h.call("test", initial.id)).code, 409);
    assert.equal(h.calls, 3);
  } finally { repo.close(); }
});

test("rate quota expires at the window boundary", t => {
  const repo = createRepository();
  t.mock.method(Date, "now", () => 2_000_000);
  try {
    assert.equal(repo.allow("boundary", 1, 60000), true);
    assert.equal(repo.allow("boundary", 1, 60000), false);
    Date.now.mock.mockImplementation(() => 2_059_999);
    assert.equal(repo.allow("boundary", 1, 60000), false);
    Date.now.mock.mockImplementation(() => 2_060_000);
    assert.equal(repo.allow("boundary", 1, 60000), true);
  } finally { repo.close(); }
});
