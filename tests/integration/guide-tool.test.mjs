import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { respondWithGuides } from "../../guides/guide-tools.mjs";
import { noStartGuide } from "../../guides/no-start.mjs";
import { guideRegistry } from "../../guides/registry.mjs";
import { buildInstructions } from "../../instructions.mjs";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, intakeResponseSchema, createIntakeResponseSchema, validateModelResponse } from "../../intake.mjs";
import { createChatHandler, createSessionHandler } from "../../chat-route.mjs";
import { createChatSessionStore } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";

const company = JSON.parse(readFileSync(new URL("../../company.json", import.meta.url), "utf8"));
const instructionsForGuides = ids => buildInstructions({
  company, priceBooks: {}, currentPragueDate: "27. října 2026",
  requestAlreadySent: false, awaitingSendConfirmation: false,
  activeGuides: ids,
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
  return { type: "function_call", name: "load_guides", arguments: JSON.stringify({ guideIds: Array.isArray(guideId) ? guideId : [guideId] }), call_id: "guide-call-1", ...overrides };
}
const called = (...calls) => ({ status: "completed", output: calls });
function answer(request, intake = emptyIntakeState(), extras = {}) {
  const data = {
    safetyWarning: "", reply: "Ozve se jedno cvaknutí, nebo více za sebou?",
    language: "cs", priceQuoted: false, replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction: "keep",
    tirePriceRequest: null, oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake, submissionAction: "none",
  };
  const actions = request.text?.format?.schema?.properties?.guideActions;
  if (actions) {
    data.guideActions = Object.fromEntries(
      Object.keys(actions.properties).map(id => [id, "keep"]),
    );
  }
  Object.assign(data, extras);
  return { status: "completed", output: [], output_text: JSON.stringify(data) };
}

test("disabled guide removes rules and knowledge without changing other company data", () => {
  const before = structuredClone(company);
  const text = instructionsForGuides([]);
  const expected = structuredClone(company);
  for (const id of Object.keys(guideRegistry)) delete expected.symptomGuide[id];
  assert.ok(!text.includes(noStartGuide.instructions));
  assert.deepEqual(sentCompany({ instructions: text }), expected);
  assert.deepEqual(company, before);
});

test("enabled guide includes original knowledge and exactly one copy of its rules", () => {
  const text = instructionsForGuides(["noStart"]);
  assert.equal(text.split(noStartGuide.instructions).length - 1, 1);
  assert.deepEqual(sentCompany({ instructions: text }).symptomGuide.noStart, noStartGuide.knowledge);
});

test("loading retains function linkage and reasoning, then requires keep/clear with tools disabled", async () => {
  const requests = [];
  const params = baseParams();
  const before = structuredClone(params);
  const reasoning = { type: "reasoning", id: "rs-test", summary: [], encrypted_content: "test-encrypted" };
  const result = await respondWithGuides({
    params, instructionsForGuides,
    createResponse: async request => {
      requests.push(structuredClone(request));
      return requests.length === 1 ? called(reasoning, toolCall()) : answer(request);
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tool_choice, "auto");
  assert.equal(requests[0].parallel_tool_calls, false);
  assert.deepEqual(requests[0].tools[0].parameters.properties.guideIds.items.enum, Object.keys(guideRegistry).sort());
  assert.equal(requests[0].tools[0].strict, true);
  assert.equal(Object.hasOwn(sentCompany(requests[0]).symptomGuide, "noStart"), false);
  assert.equal(Object.hasOwn(requests[0].text.format.schema.properties, "guideActions"), false);
  assert.deepEqual(sentCompany(requests[1]).symptomGuide.noStart, noStartGuide.knowledge);
  assert.deepEqual(requests[1].input[1], reasoning);
  assert.equal(requests[1].input.at(-1).call_id, "guide-call-1");
  assert.equal(requests[1].tool_choice, "none");
  assert.deepEqual(requests[1].tools, []);
  assert.ok(requests[1].text.format.schema.required.includes("guideActions"));
  assert.deepEqual(result.activeGuides, ["noStart"]);
  assert.equal(Object.hasOwn(JSON.parse(result.response.output_text), "guideActions"), false);
  assert.deepEqual(params, before);
});

test("keep preserves a loaded guide on a short continuation in one call", async () => {
    const message = "cvaka";
    let calls = 0;
    const result = await respondWithGuides({
      params: baseParams(message), activeGuides: ["noStart"], instructionsForGuides,
      createResponse: async request => {
        calls++;
        assert.ok(request.instructions.includes(noStartGuide.instructions));
        assert.equal(request.tool_choice, "auto");
        assert.deepEqual(request.tools[0].parameters.properties.guideIds.items.enum, Object.keys(guideRegistry).filter(id => id !== "noStart").sort());
        assert.deepEqual(request.text.format.schema.properties.guideActions.properties.noStart.enum, ["keep", "clear"]);
        assert.ok(request.text.format.schema.required.includes("guideActions"));
        return answer(request);
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.activeGuides, ["noStart"]);
    assert.ok(validateModelResponse(JSON.parse(result.response.output_text)));
});

test("clear removes guide from subsequent requests in one call without exposing metadata", async () => {
  let calls = 0;
  const result = await respondWithGuides({
    params: baseParams("Jiný dotaz: výměna oleje"), activeGuides: ["noStart"], instructionsForGuides,
    createResponse: async request => {
      calls++;
      return answer(request, undefined, { guideActions: { noStart: "clear" } });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.activeGuides, []);
  assert.ok(validateModelResponse(JSON.parse(result.response.output_text)));
  assert.equal(Object.hasOwn(JSON.parse(result.response.output_text), "guideActions"), false);
  assert.equal(Object.hasOwn(sentCompany(result.request).symptomGuide, "noStart"), false);
  assert.ok(!result.request.instructions.includes(noStartGuide.instructions));
});

for (const [label, invalid] of [
  ["unknown function", toolCall("noStart", { name: "read_file" })],
  ["arbitrary path", toolCall("../.env")],
  ["extra property", toolCall("noStart", { arguments: '{"guideIds":["noStart"],"path":".env"}' })],
  ["malformed JSON", toolCall("noStart", { arguments: "{" })],
  ["null arguments", toolCall("noStart", { arguments: "null" })],
  ["array arguments", toolCall("noStart", { arguments: '["noStart"]' })],
  ["missing call ID", toolCall("noStart", { call_id: "" })],
  ["old none tool action", toolCall("none")],
]) {
  test("invalid tool request is rejected without a second call: " + label, async () => {
    let calls = 0;
    const result = await respondWithGuides({
      params: baseParams(), instructionsForGuides,
      createResponse: async () => { calls++; return called(invalid); },
    });
    assert.equal(result.response, null);
    assert.deepEqual(result.activeGuides, []);
    assert.equal(calls, 1);
  });
}

test("multiple tool calls cannot partially change selection", async () => {
  let calls = 0;
  const result = await respondWithGuides({
    params: baseParams(), instructionsForGuides,
    createResponse: async () => {
      calls++;
      return called(toolCall(), toolCall("none", { call_id: "second" }));
    },
  });
  assert.equal(result.response, null);
  assert.deepEqual(result.activeGuides, []);
  assert.equal(calls, 1);
});

test("a second function call after loading cannot loop", async () => {
  let calls = 0;
  const result = await respondWithGuides({
    params: baseParams(), instructionsForGuides,
    createResponse: async () => { calls++; return called(toolCall()); },
  });
  assert.equal(result.response, null);
  assert.equal(calls, 2);
});

test("an active guide cannot call the loading tool again", async () => {
  let calls = 0;
  const result = await respondWithGuides({
    params: baseParams("cvaka"), activeGuides: ["noStart"], instructionsForGuides,
    createResponse: async () => { calls++; return called(toolCall()); },
  });
  assert.equal(result.response, null);
  assert.deepEqual(result.activeGuides, ["noStart"]);
  assert.equal(calls, 1);
});

for (const action of [undefined, null, true, "", "none", "unexpected"]) {
  test("missing or invalid guideActions is rejected without clearing stored state: " + String(action), async () => {
    const result = await respondWithGuides({
      params: baseParams("cvaka"), activeGuides: ["noStart"], instructionsForGuides,
      createResponse: async request => answer(request, undefined, { guideActions: action }),
    });
    assert.equal(result.response, null);
    assert.deepEqual(result.activeGuides, ["noStart"]);
  });
}

test("incomplete response does not execute a tool or require a guide decision", async () => {
  for (const activeGuide of [null, "noStart"]) {
    let calls = 0;
    const result = await respondWithGuides({
      params: baseParams(), activeGuides: activeGuide ? [activeGuide] : [], instructionsForGuides,
      createResponse: async () => { calls++; return { status: "incomplete", output: [] }; },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.activeGuides, activeGuide ? [activeGuide] : []);
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
  await assert.rejects(() => respondWithGuides({
    params: baseParams(), instructionsForGuides, signal: controller.signal,
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
  assert.deepEqual(result.activeGuides, ["noStart"]);
  assert.equal(result.submissionAction, "none");
  assert.match(result.text, /cvaknutí/);
  assert.ok(!result.text.includes("guideActions"));
  assert.equal(calls, 2);
});

for (const action of ["keep", "clear"]) {
  test("price repair restores original schema and preserves guide decision: " + action, async () => {
    const requests = [];
    const quoted = {
      tirePriceRequest: null, oilPriceMode: "requested",
      oilPriceRequests: [{ optionId: "engine_oil", source: "compare" }],
      reply: "Cena je 400 Kč.", oilPriceFollowUp: "Má materiál zajistit servis?",
    };
    const result = await getReply("A kolik stojí výměna oleje?", company, [], emptyIntakeState(),
      undefined, false, async request => {
        requests.push(structuredClone(request));
        if (requests.length === 1) return answer(request, undefined, { ...quoted, guideActions: { noStart: action } });
        return answer(request, undefined, { ...quoted, reply: "Cena práce závisí na dodání materiálu." });
      }, false, { activeGuide: "noStart" });
    assert.equal(result.kind, "reply");
    assert.deepEqual(result.activeGuides, action === "keep" ? ["noStart"] : []);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].tool_choice, "none");
    assert.deepEqual(requests[1].text.format.schema, createIntakeResponseSchema(company));
    assert.equal(Object.hasOwn(requests[1].text.format.schema.properties, "guideActions"), false);
    assert.equal(requests[1].instructions.includes(noStartGuide.instructions), action === "keep");
    assert.match(result.text, /400 Kč/);
    assert.match(result.text, /500 Kč/);
  });
}

test("price repair after loading retains the function-call context", async () => {
  const requests = [];
  const quoted = { tirePriceRequest: null, oilPriceMode: "requested",
    oilPriceRequests: [{ optionId: "engine_oil", source: "compare" }],
    reply: "Cena je 400 Kč.", oilPriceFollowUp: "Má materiál zajistit servis?" };
  const result = await getReply("cenu", company, [], emptyIntakeState(), undefined, false, async request => {
    requests.push(structuredClone(request));
    if (requests.length === 1) return called(toolCall());
    return answer(request, undefined, requests.length === 2 ? quoted : { ...quoted, reply: "Cena závisí na materiálu." });
  });
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.activeGuides, ["noStart"]);
  assert.equal(requests.length, 3);
  assert.ok(requests[2].input.some(item => item.type === "function_call_output"));
  assert.deepEqual(requests[2].text.format.schema, createIntakeResponseSchema(company));
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
    assert.deepEqual(repository.load(first.id).activeGuides, ["noStart"]);
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
    assert.deepEqual(repository.load(first.id).activeGuides, ["noStart"]);
    assert.ok(!JSON.stringify(continued.body).includes("guideActions"));
    assert.ok(!JSON.stringify(repository.load(first.id).history).includes("guideActions"));

    const other = store({ headers: {}, ip: "guide-tests" }, response());
    let isolated;
    await chat(makeHandler(store, async request => { isolated = request; return answer(request); }), other.id, "Výměna oleje");
    assert.equal(Object.hasOwn(sentCompany(isolated).symptomGuide, "noStart"), false);

    createSessionHandler({ getSession: store, reset: true })({
      headers: { cookie: "caro_session=" + first.id }, body: {},
    }, response());
    assert.deepEqual(repository.load(first.id).activeGuides, []);
    let afterReset;
    await chat(makeHandler(store, async request => { afterReset = request; return answer(request); }), first.id, "Dobrý den");
    assert.equal(Object.hasOwn(sentCompany(afterReset).symptomGuide, "noStart"), false);
    assert.equal(Object.hasOwn(afterReset.text.format.schema.properties, "guideActions"), false);
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
    assert.deepEqual(repository.load(first.id).activeGuides, ["noStart"]);
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
      calls++; return answer(request, undefined, { guideActions: { noStart: "clear" } });
    }), first.id, "Jiný dotaz: výměna oleje");
    assert.equal(calls, 1);
    assert.deepEqual(repository.load(first.id).activeGuides, []);
    store = createChatSessionStore({ repository });
    let request;
    await chat(makeHandler(store, async params => { request = params; return answer(params); }), first.id, "Dobrý den", {
      activeGuide: "noStart", activeGuides: ["noStart"],
      serverContext: { activeGuide: "noStart", activeGuides: ["noStart"] },
      guideActions: { noStart: "keep" },
    });
    assert.equal(Object.hasOwn(sentCompany(request).symptomGuide, "noStart"), false);
    assert.equal(Object.hasOwn(request.text.format.schema.properties, "guideActions"), false);
  } finally { repository.close(); }
});

test("invalid guide decision cannot clear persisted state or become a customer reply", async () => {
  const repository = createRepository();
  try {
    const store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "guide-tests" }, response());
    await loadGuide(store, first.id);
    await chat(makeHandler(store, async request =>
      answer(request, undefined, { guideActions: "invalid" })), first.id, "cvaka", {}, 502);
    assert.deepEqual(repository.load(first.id).activeGuides, ["noStart"]);
    assert.ok(!JSON.stringify(repository.load(first.id).history).includes("guideActions"));
  } finally { repository.close(); }
});
