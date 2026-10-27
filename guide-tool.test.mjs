import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { respondWithGuide } from "./guides/guide-tools.mjs";
import { noStartGuide } from "./guides/no-start.mjs";
import { buildInstructions } from "./instructions.mjs";
import { getReply } from "./service.mjs";
import { emptyIntakeState, intakeResponseSchema, validateModelResponse } from "./intake.mjs";
import { createChatHandler, createSessionHandler } from "./chat-route.mjs";
import { createChatSessionStore } from "./chat-session.mjs";
import { createRepository } from "./storage.mjs";

const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
const instructionsForGuide = id => buildInstructions({
  company, priceBooks: {}, currentPragueDate: "27. října 2026",
  requestAlreadySent: false, awaitingSendConfirmation: false,
  includeNoStartGuide: id === "noStart",
});
function sentCompany(request) {
  return JSON.parse(request.instructions.split("\n").find(line =>
    line.startsWith("Firemní data: ")).slice("Firemní data: ".length));
}
function baseParams(message = "Auto nestartuje") {
  return {
    model: "gpt-6-luna", store: false,
    input: [{ role: "user", content: message }],
    text: { format: {
      type: "json_schema", name: "autoservice_reply_and_intake", strict: true,
      schema: structuredClone(intakeResponseSchema),
    } },
  };
}
function toolCall(guideId = "noStart", overrides = {}) {
  return { type: "function_call", name: "select_guide", arguments: JSON.stringify({ guideId }), call_id: "guide-call-1", ...overrides };
}
const called = (...calls) => ({ status: "completed", output: calls });
function answer(request, intake = emptyIntakeState(), extras = {}) {
  const data = {
    safetyWarning: "", reply: "Ozve se jedno cvaknutí, nebo více za sebou?",
    language: "cs", priceQuoted: false, partsAction: "keep",
    oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake, submissionAction: "none",
  };
  if (request.text?.format?.schema?.properties?.guideAction) data.guideAction = "keep";
  Object.assign(data, extras);
  return { status: "completed", output: [], output_text: JSON.stringify(data) };
}

test("disabled guide removes rules and knowledge without changing other company data", () => {
  const before = structuredClone(company);
  const text = instructionsForGuide(null);
  const expected = structuredClone(company);
  delete expected.symptomGuide.noStart;
  assert.ok(!text.includes(noStartGuide.instructions));
  assert.deepEqual(sentCompany({ instructions: text }), expected);
  assert.deepEqual(company, before);
});

test("enabled guide includes original knowledge and exactly one copy of its rules", () => {
  const text = instructionsForGuide("noStart");
  assert.equal(text.split(noStartGuide.instructions).length - 1, 1);
  assert.deepEqual(sentCompany({ instructions: text }).symptomGuide.noStart, noStartGuide.knowledge);
});

test("loading retains function linkage and reasoning, then requires keep/clear with tools disabled", async () => {
  const requests = [];
  const params = baseParams();
  const before = structuredClone(params);
  const reasoning = { type: "reasoning", id: "rs-test", summary: [], encrypted_content: "test-encrypted" };
  const result = await respondWithGuide({
    params, instructionsForGuide,
    createResponse: async request => {
      requests.push(structuredClone(request));
      return requests.length === 1 ? called(reasoning, toolCall()) : answer(request);
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tool_choice, "auto");
  assert.equal(requests[0].parallel_tool_calls, false);
  assert.deepEqual(requests[0].tools[0].parameters.properties.guideId.enum, ["noStart"]);
  assert.equal(requests[0].tools[0].strict, true);
  assert.equal(Object.hasOwn(sentCompany(requests[0]).symptomGuide, "noStart"), false);
  assert.equal(Object.hasOwn(requests[0].text.format.schema.properties, "guideAction"), false);
  assert.deepEqual(sentCompany(requests[1]).symptomGuide.noStart, noStartGuide.knowledge);
  assert.deepEqual(requests[1].input[1], reasoning);
  assert.equal(requests[1].input.at(-1).call_id, "guide-call-1");
  assert.equal(requests[1].tool_choice, "none");
  assert.deepEqual(requests[1].tools, []);
  assert.ok(requests[1].text.format.schema.required.includes("guideAction"));
  assert.equal(result.activeGuide, "noStart");
  assert.equal(Object.hasOwn(JSON.parse(result.response.output_text), "guideAction"), false);
  assert.deepEqual(params, before);
});

test("ordinary oil request stays one model call without guide or guideAction", async () => {
  let calls = 0;
  const result = await respondWithGuide({
    params: baseParams("Výměna oleje"), instructionsForGuide,
    createResponse: async request => {
      calls++;
      assert.equal(Object.hasOwn(sentCompany(request).symptomGuide, "noStart"), false);
      assert.equal(Object.hasOwn(request.text.format.schema.properties, "guideAction"), false);
      return answer(request);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.activeGuide, null);
});

for (const message of ["cvaka", "Suzuki Swift 2018", "ano", "Chci kontrolu startování", "Potřebuji odtah"]) {
  test("keep preserves guide for continuation in one call: " + message, async () => {
    let calls = 0;
    const result = await respondWithGuide({
      params: baseParams(message), activeGuide: "noStart", instructionsForGuide,
      createResponse: async request => {
        calls++;
        assert.ok(request.instructions.includes(noStartGuide.instructions));
        assert.deepEqual(request.tools, []);
        assert.equal(request.tool_choice, "none");
        assert.deepEqual(request.text.format.schema.properties.guideAction.enum, ["keep", "clear"]);
        assert.ok(request.text.format.schema.required.includes("guideAction"));
        return answer(request);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.activeGuide, "noStart");
    assert.ok(validateModelResponse(JSON.parse(result.response.output_text)));
  });
}

test("clear removes guide from subsequent requests in one call without exposing metadata", async () => {
  let calls = 0;
  const result = await respondWithGuide({
    params: baseParams("Jiný dotaz: výměna oleje"), activeGuide: "noStart", instructionsForGuide,
    createResponse: async request => {
      calls++;
      return answer(request, undefined, { guideAction: "clear" });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.activeGuide, null);
  assert.ok(validateModelResponse(JSON.parse(result.response.output_text)));
  assert.equal(Object.hasOwn(JSON.parse(result.response.output_text), "guideAction"), false);
  assert.equal(Object.hasOwn(sentCompany(result.request).symptomGuide, "noStart"), false);
  assert.ok(!result.request.instructions.includes(noStartGuide.instructions));
});

for (const [label, invalid] of [
  ["unknown function", toolCall("noStart", { name: "read_file" })],
  ["arbitrary path", toolCall("../.env")],
  ["extra property", toolCall("noStart", { arguments: '{"guideId":"noStart","path":".env"}' })],
  ["malformed JSON", toolCall("noStart", { arguments: "{" })],
  ["null arguments", toolCall("noStart", { arguments: "null" })],
  ["array arguments", toolCall("noStart", { arguments: '["noStart"]' })],
  ["missing call ID", toolCall("noStart", { call_id: "" })],
  ["old none tool action", toolCall("none")],
]) {
  test("invalid tool request is rejected without a second call: " + label, async () => {
    let calls = 0;
    const result = await respondWithGuide({
      params: baseParams(), instructionsForGuide,
      createResponse: async () => { calls++; return called(invalid); },
    });
    assert.equal(result.response, null);
    assert.equal(result.activeGuide, null);
    assert.equal(calls, 1);
  });
}

test("multiple tool calls cannot partially change selection", async () => {
  let calls = 0;
  const result = await respondWithGuide({
    params: baseParams(), instructionsForGuide,
    createResponse: async () => {
      calls++;
      return called(toolCall(), toolCall("none", { call_id: "second" }));
    },
  });
  assert.equal(result.response, null);
  assert.equal(result.activeGuide, null);
  assert.equal(calls, 1);
});

test("a second function call after loading cannot loop", async () => {
  let calls = 0;
  const result = await respondWithGuide({
    params: baseParams(), instructionsForGuide,
    createResponse: async () => { calls++; return called(toolCall()); },
  });
  assert.equal(result.response, null);
  assert.equal(calls, 2);
});

test("an active guide cannot call the loading tool again", async () => {
  let calls = 0;
  const result = await respondWithGuide({
    params: baseParams("cvaka"), activeGuide: "noStart", instructionsForGuide,
    createResponse: async () => { calls++; return called(toolCall()); },
  });
  assert.equal(result.response, null);
  assert.equal(result.activeGuide, "noStart");
  assert.equal(calls, 1);
});

for (const action of [undefined, null, true, "", "none", "unexpected"]) {
  test("missing or invalid guideAction is rejected without clearing stored state: " + String(action), async () => {
    const result = await respondWithGuide({
      params: baseParams("cvaka"), activeGuide: "noStart", instructionsForGuide,
      createResponse: async request => answer(request, undefined, { guideAction: action }),
    });
    assert.equal(result.response, null);
    assert.equal(result.activeGuide, "noStart");
  });
}

test("incomplete response does not execute a tool or require a guide decision", async () => {
  for (const activeGuide of [null, "noStart"]) {
    let calls = 0;
    const result = await respondWithGuide({
      params: baseParams(), activeGuide, instructionsForGuide,
      createResponse: async () => { calls++; return { status: "incomplete", output: [] }; },
    });
    assert.equal(calls, 1);
    assert.equal(result.activeGuide, activeGuide);
  }
});

test("refusal bypasses guide metadata parsing and remains a refusal in getReply", async () => {
  const refusal = { status: "completed", output: [{
    type: "message", content: [{ type: "refusal", refusal: "Test refusal" }],
  }], output_text: "" };
  const result = await getReply("test", company, [], emptyIntakeState(),
    undefined, false, async () => refusal, false, { activeGuide: "noStart" });
  assert.equal(result.kind, "refusal");
});

test("same abort signal reaches both requests and timeout propagates", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(() => respondWithGuide({
    params: baseParams(), instructionsForGuide, signal: controller.signal,
    createResponse: async (_request, options) => {
      assert.equal(options.signal, controller.signal);
      if (++calls === 1) return called(toolCall());
      throw Error("test timeout");
    },
  }), /test timeout/);
  assert.equal(calls, 2);
});

test("getReply loads guide and strips internal decision before validating the normal schema", async () => {
  let calls = 0;
  const result = await getReply("Auto nejde nastartovat", company, [], emptyIntakeState(),
    undefined, false, async request => ++calls === 1 ? called(toolCall()) : answer(request));
  assert.equal(result.kind, "reply");
  assert.equal(result.activeGuide, "noStart");
  assert.equal(result.submissionAction, "none");
  assert.match(result.text, /cvaknutí/);
  assert.ok(!result.text.includes("guideAction"));
  assert.equal(calls, 2);
});

for (const action of ["keep", "clear"]) {
  test("price repair restores original schema and preserves guide decision: " + action, async () => {
    const requests = [];
    const quoted = {
      oilPriceMode: "requested",
      oilPriceRequests: [{ optionId: "engine_oil", source: "compare" }],
      reply: "Cena je 400 Kč.", oilPriceFollowUp: "Má materiál zajistit servis?",
    };
    const result = await getReply("A kolik stojí výměna oleje?", company, [], emptyIntakeState(),
      undefined, false, async request => {
        requests.push(structuredClone(request));
        if (requests.length === 1) return answer(request, undefined, { ...quoted, guideAction: action });
        return answer(request, undefined, { ...quoted, reply: "Cena práce závisí na dodání materiálu." });
      }, false, { activeGuide: "noStart" });
    assert.equal(result.kind, "reply");
    assert.equal(result.activeGuide, action === "keep" ? "noStart" : null);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].tool_choice, "none");
    assert.deepEqual(requests[1].text.format.schema, intakeResponseSchema);
    assert.equal(Object.hasOwn(requests[1].text.format.schema.properties, "guideAction"), false);
    assert.equal(requests[1].instructions.includes(noStartGuide.instructions), action === "keep");
    assert.match(result.text, /400 Kč/);
    assert.match(result.text, /500 Kč/);
  });
}

test("price repair after loading retains the function-call context", async () => {
  const requests = [];
  const quoted = { oilPriceMode: "requested",
    oilPriceRequests: [{ optionId: "engine_oil", source: "compare" }],
    reply: "Cena je 400 Kč.", oilPriceFollowUp: "Má materiál zajistit servis?" };
  const result = await getReply("cenu", company, [], emptyIntakeState(), undefined, false, async request => {
    requests.push(structuredClone(request));
    if (requests.length === 1) return called(toolCall());
    return answer(request, undefined, requests.length === 2 ? quoted : { ...quoted, reply: "Cena závisí na materiálu." });
  });
  assert.equal(result.kind, "reply");
  assert.equal(result.activeGuide, "noStart");
  assert.equal(requests.length, 3);
  assert.ok(requests[2].input.some(item => item.type === "function_call_output"));
  assert.deepEqual(requests[2].text.format.schema, intakeResponseSchema);
});

test("required metadata and tool schemas do not leak between sessions or mutate original params", async () => {
  const params = baseParams();
  const before = structuredClone(params);
  for (const activeGuide of [null, "noStart", null, "noStart"]) {
    let captured;
    await respondWithGuide({
      params, activeGuide, instructionsForGuide,
      createResponse: async request => { captured = request; return answer(request); },
    });
    assert.equal(Object.hasOwn(captured.text.format.schema.properties, "guideAction"), activeGuide === "noStart");
    assert.equal(captured.tool_choice, activeGuide ? "none" : "auto");
    if (activeGuide) assert.deepEqual(captured.tools, []);
    else assert.deepEqual(captured.tools[0].parameters.properties.guideId.enum, ["noStart"]);
    assert.deepEqual(params, before);
  }
});

function response() {
  return Object.assign(new EventEmitter(), {
    locals: {}, writableEnded: false, destroyed: false, code: 200,
    cookie() {}, set() { return this; }, json(body) { this.body = body; return this; },
    status(code) { this.code = code; return this; },
  });
}
function makeHandler(store, createResponse) {
  return createChatHandler({
    getSession: store, loadCompanyData: async () => company,
    replyToMessage: (...args) => { args[6] = createResponse; return getReply(...args); },
    sendConfirmation: () => { throw Error("Mail is forbidden in guide tests"); },
  });
}
let messageNumber = 0;
async function chat(handler, id, message, extras = {}, status = 200) {
  const out = response();
  await handler({
    headers: { cookie: "caro_session=" + id }, ip: "guide-tests",
    body: { message, messageId: "guide-test-" + (++messageNumber), ...extras },
  }, out);
  assert.equal(out.code, status, JSON.stringify(out.body));
  return out;
}
async function loadGuide(store, id) {
  let calls = 0;
  await chat(makeHandler(store, async request => ++calls === 1 ? called(toolCall()) : answer(request)), id, "Auto nestartuje");
  assert.equal(calls, 2);
}

test("keep survives page reload and cvaka while new sessions and chat reset stay isolated", async () => {
  const repository = createRepository();
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "guide-tests" }, response());
    await loadGuide(store, first.id);
    assert.equal(repository.load(first.id).activeGuide, "noStart");
    store = createChatSessionStore({ repository });
    const view = response();
    createSessionHandler({ getSession: store })({ headers: { cookie: "caro_session=" + first.id } }, view);
    assert.equal(view.body.history.length, 2);
    const requests = [];
    const continued = await chat(makeHandler(store, async request => {
      requests.push(request); return answer(request);
    }), first.id, "cvaka");
    assert.equal(requests.length, 1);
    assert.ok(requests[0].instructions.includes(noStartGuide.instructions));
    assert.equal(repository.load(first.id).activeGuide, "noStart");
    assert.ok(!JSON.stringify(continued.body).includes("guideAction"));
    assert.ok(!JSON.stringify(repository.load(first.id).history).includes("guideAction"));

    const other = store({ headers: {}, ip: "guide-tests" }, response());
    let isolated;
    await chat(makeHandler(store, async request => { isolated = request; return answer(request); }), other.id, "Výměna oleje");
    assert.equal(Object.hasOwn(sentCompany(isolated).symptomGuide, "noStart"), false);

    createSessionHandler({ getSession: store, reset: true })({
      headers: { cookie: "caro_session=" + first.id }, body: {},
    }, response());
    assert.equal(repository.load(first.id).activeGuide, null);
    let afterReset;
    await chat(makeHandler(store, async request => { afterReset = request; return answer(request); }), first.id, "Dobrý den");
    assert.equal(Object.hasOwn(sentCompany(afterReset).symptomGuide, "noStart"), false);
    assert.equal(Object.hasOwn(afterReset.text.format.schema.properties, "guideAction"), false);
  } finally { repository.close(); }
});

test("guide survives closing SQLite with the original issue outside the model history window", async () => {
  const directory = mkdtempSync(join(tmpdir(), "caro-guide-tests-"));
  const path = join(directory, "sessions.sqlite");
  let repository = createRepository(path);
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "guide-tests" }, response());
    await loadGuide(store, first.id);
    const saved = repository.load(first.id);
    for (let i = 0; i < 40; i++) saved.history.push({
      id: "older-" + i, role: i % 2 ? "assistant" : "user",
      content: "Doplňující informace " + i, at: new Date().toISOString(),
    });
    repository.save(saved);
    repository.close();
    repository = createRepository(path);
    store = createChatSessionStore({ repository });
    const requests = [];
    await chat(makeHandler(store, async request => { requests.push(request); return answer(request); }), first.id, "cvaka");
    assert.equal(requests.length, 1);
    assert.ok(requests[0].instructions.includes(noStartGuide.instructions));
    assert.ok(!requests[0].input.some(item => item.content === "Auto nestartuje"));
    assert.equal(repository.load(first.id).activeGuide, "noStart");
  } finally {
    repository.close();
    for (const name of ["sessions.sqlite", "sessions.sqlite-wal", "sessions.sqlite-shm"]) {
      const file = join(directory, name);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(directory);
  }
});

test("clear is persisted and the next request omits guide; browser fields cannot activate it", async () => {
  const repository = createRepository();
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "guide-tests" }, response());
    await loadGuide(store, first.id);
    let calls = 0;
    await chat(makeHandler(store, async request => {
      calls++; return answer(request, undefined, { guideAction: "clear" });
    }), first.id, "Jiný dotaz: výměna oleje");
    assert.equal(calls, 1);
    assert.equal(repository.load(first.id).activeGuide, null);
    store = createChatSessionStore({ repository });
    let request;
    await chat(makeHandler(store, async params => { request = params; return answer(params); }), first.id, "Dobrý den", {
      activeGuide: "noStart", serverContext: { activeGuide: "noStart" }, guideAction: "keep",
    });
    assert.equal(Object.hasOwn(sentCompany(request).symptomGuide, "noStart"), false);
    assert.equal(Object.hasOwn(request.text.format.schema.properties, "guideAction"), false);
  } finally { repository.close(); }
});

test("invalid guide decision cannot clear persisted state or become a customer reply", async () => {
  const repository = createRepository();
  try {
    const store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "guide-tests" }, response());
    await loadGuide(store, first.id);
    await chat(makeHandler(store, async request =>
      answer(request, undefined, { guideAction: "invalid" })), first.id, "cvaka", {}, 502);
    assert.equal(repository.load(first.id).activeGuide, "noStart");
    assert.ok(!JSON.stringify(repository.load(first.id).history).includes("guideAction"));
  } finally { repository.close(); }
});
