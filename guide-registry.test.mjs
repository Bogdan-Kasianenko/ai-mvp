import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { guideRegistry, normalizeGuideIds, readActiveGuideIds, requiredGuideIds } from "./guides/registry.mjs";
import { respondWithGuides } from "./guides/guide-tools.mjs";
import { emptyIntakeState, intakeResponseSchema, validateModelResponse } from "./intake.mjs";
import { getReply } from "./service.mjs";
import { createChatHandler } from "./chat-route.mjs";
import { createChatSessionStore } from "./chat-session.mjs";
import { createRepository } from "./storage.mjs";

const registry = Object.freeze({
  diagA: { description: "Test diagnostic A", serviceIds: [] },
  diagB: { description: "Test diagnostic B", serviceIds: [] },
  oil: { description: "Test oil service", serviceIds: ["oil_filters"] },
  tires: { description: "Test tire service", serviceIds: ["tires"] },
});
const instructionsForGuides = ids => "TEST GUIDES: " + JSON.stringify(ids);
function params() {
  return {
    model: "gpt-6-luna", store: false,
    input: [{ role: "user", content: "Test message" }],
    text: { format: {
      type: "json_schema", name: "test_reply", strict: true,
      schema: structuredClone(intakeResponseSchema),
    } },
  };
}
function answer(request, overrides = {}) {
  const data = {
    safetyWarning: "", reply: "Test reply", language: "cs", priceQuoted: false,
    partsAction: "keep", oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake: emptyIntakeState(), submissionAction: "none",
  };
  const actions = request.text.format.schema.properties.guideActions;
  if (actions) data.guideActions = Object.fromEntries(Object.keys(actions.properties).map(id => [id, "keep"]));
  Object.assign(data, overrides);
  return { status: "completed", output: [], output_text: JSON.stringify(data) };
}
function tool(ids) {
  return { status: "completed", output: [{
    type: "function_call", name: "load_guides",
    arguments: JSON.stringify({ guideIds: ids }), call_id: "batch-1",
  }] };
}

test("production registry enables noStart and jerking without binding either symptom to a booked service", () => {
  assert.deepEqual(Object.keys(guideRegistry).sort(), ["jerkingDuringAcceleration", "noStart"]);
  assert.deepEqual(requiredGuideIds(["diagnostics:", "oil_filters:engine_oil"]), []);
});

test("guide normalization rejects unknown, inherited, path and non-string IDs and deduplicates", () => {
  assert.deepEqual(normalizeGuideIds(["diagB", "diagA", "diagB", "../.env", "toString", 7, null], registry), ["diagA", "diagB"]);
  assert.deepEqual(normalizeGuideIds("diagA", registry), []);
  assert.deepEqual(normalizeGuideIds(null, registry), []);
  const inherited = Object.create({ ghost: registry.diagA });
  inherited.diagA = registry.diagA;
  assert.deepEqual(normalizeGuideIds(["ghost", "diagA"], inherited), ["diagA"]);
});

test("legacy state is read without mutation and explicit empty new state never revives old guide", () => {
  const old = { activeGuide: "noStart" };
  assert.deepEqual(readActiveGuideIds(old), ["noStart"]);
  assert.deepEqual(old, { activeGuide: "noStart" });
  assert.deepEqual(readActiveGuideIds({ activeGuide: "noStart", activeGuides: [] }), []);
  assert.deepEqual(readActiveGuideIds({ activeGuides: ["diagB", "diagA", "diagB"] }, registry), ["diagA", "diagB"]);
  assert.deepEqual(readActiveGuideIds({ activeGuide: "../.env" }), []);
});

test("required guides are derived from exact service categories, including simultaneous work and removal", () => {
  assert.deepEqual(requiredGuideIds(["oil_filters:engine_oil", "tires:seasonal_tires"], registry), ["oil", "tires"]);
  assert.deepEqual(requiredGuideIds(["oil_filters:engine_oil", "oil_filters:air_filter"], registry), ["oil"]);
  assert.deepEqual(requiredGuideIds(["tires:wheel_swap"], registry), ["tires"]);
  assert.deepEqual(requiredGuideIds(["not_tires:seasonal_tires", "other", null], registry), []);
  assert.deepEqual(requiredGuideIds(null, registry), []);
});

test("one batch loads two guides and preserves their independent decisions without altering source params", async () => {
  const source = params();
  const before = structuredClone(source);
  const requests = [];
  const result = await respondWithGuides({
    params: source, registry, instructionsForGuides,
    createResponse: async request => {
      requests.push(structuredClone(request));
      return requests.length === 1 ? tool(["diagA", "diagB"]) :
        answer(request, { guideActions: { diagA: "clear", diagB: "keep" } });
    },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(Object.keys(requests[1].text.format.schema.properties.guideActions.properties), ["diagA", "diagB"]);
  assert.deepEqual(result.activeGuides, ["diagB"]);
  assert.equal(requests[1].input.at(-1).call_id, "batch-1");
  assert.equal(requests[1].tool_choice, "none");
  assert.ok(validateModelResponse(JSON.parse(result.response.output_text)));
  assert.equal(Object.hasOwn(JSON.parse(result.response.output_text), "guideActions"), false);
  assert.deepEqual(source, before);
});

test("another guide can be loaded while the first is active; loaded IDs are absent from tool choices", async () => {
  const requests = [];
  const result = await respondWithGuides({
    params: params(), activeGuides: ["diagA"], registry, instructionsForGuides,
    createResponse: async request => {
      requests.push(structuredClone(request));
      return requests.length === 1 ? tool(["diagB"]) : answer(request);
    },
  });
  assert.equal(requests.length, 2);
  assert.ok(!requests[0].tools[0].parameters.properties.guideIds.items.enum.includes("diagA"));
  assert.deepEqual(result.activeGuides, ["diagA", "diagB"]);
});

test("clearing a temporary guide preserves every guide bound to selected work", async () => {
  let request;
  const result = await respondWithGuides({
    params: params(), activeGuides: ["diagA", "oil"],
    requiredGuides: ["oil", "tires"], registry, instructionsForGuides,
    createResponse: async p => {
      request = p;
      return answer(p, { guideActions: { diagA: "clear", oil: "keep", tires: "keep" } });
    },
  });
  assert.deepEqual(result.activeGuides, []);
  assert.deepEqual(request.text.format.schema.properties.guideActions.properties.oil.enum, ["keep"]);
  assert.deepEqual(request.text.format.schema.properties.guideActions.properties.tires.enum, ["keep"]);
  assert.equal(result.request.instructions, 'TEST GUIDES: ["oil","tires"]');
});

test("backend rejects clearing a required guide even if a model ignores its strict schema", async () => {
  const result = await respondWithGuides({
    params: params(), requiredGuides: ["oil"], registry, instructionsForGuides,
    createResponse: async request => answer(request, { guideActions: { oil: "clear" } }),
  });
  assert.equal(result.response, null);
});

for (const [label, value] of [
  ["missing guide", { diagA: "keep" }],
  ["unknown guide", { diagA: "keep", diagB: "keep", ghost: "clear" }],
  ["invalid action", { diagA: "keep", diagB: "none" }],
  ["array", ["keep", "keep"]],
]) {
  test("multiple-guide action validation rejects " + label, async () => {
    const result = await respondWithGuides({
      params: params(), activeGuides: ["diagA", "diagB"], registry, instructionsForGuides,
      createResponse: async request => answer(request, { guideActions: value }),
    });
    assert.equal(result.response, null);
    assert.deepEqual(result.activeGuides, ["diagA", "diagB"]);
  });
}

for (const [label, ids] of [
  ["empty batch", []], ["duplicate IDs", ["diagB", "diagB"]],
  ["already loaded", ["diagA"]], ["unknown ID", ["ghost"]],
  ["mixed known and unknown", ["diagB", "../.env"]],
]) {
  test("batch request rejects " + label + " without partial loading", async () => {
    let calls = 0;
    const result = await respondWithGuides({
      params: params(), activeGuides: ["diagA"], registry, instructionsForGuides,
      createResponse: async () => { calls++; return tool(ids); },
    });
    assert.equal(calls, 1);
    assert.equal(result.response, null);
    assert.deepEqual(result.activeGuides, ["diagA"]);
  });
}

test("all guides already loaded means no available loading tools and one response", async () => {
  let calls = 0;
  const result = await respondWithGuides({
    params: params(), activeGuides: Object.keys(registry), registry, instructionsForGuides,
    createResponse: async request => {
      calls++;
      assert.deepEqual(request.tools, []);
      assert.equal(request.tool_choice, "none");
      return answer(request);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.activeGuides, ["diagA", "diagB", "oil", "tires"]);
});

test("each conversation receives its own action schema without leaking the previous guides", async () => {
  const source = params();
  const before = structuredClone(source);
  for (const ids of [["diagA"], ["diagB"], [], ["diagA", "diagB"]]) {
    await respondWithGuides({
      params: source, activeGuides: ids, registry, instructionsForGuides,
      createResponse: async request => {
        const actions = request.text.format.schema.properties.guideActions;
        assert.deepEqual(actions ? Object.keys(actions.properties) : [], ids);
        return answer(request);
      },
    });
  }
  assert.deepEqual(source, before);
});

function response() {
  return Object.assign(new EventEmitter(), {
    locals: {}, writableEnded: false, destroyed: false, code: 200,
    cookie() {}, set() { return this; }, json(body) { this.body = body; return this; },
    status(code) { this.code = code; return this; },
  });
}
const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));

test("old persisted session migrates during a real handler request, restores and clears without resurrection", async () => {
  const repository = createRepository();
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "legacy-guide-test" }, response());
    first.activeGuide = "noStart";
    first.persist();
    let action = "keep";
    let calls = 0;
    function handler() {
      return createChatHandler({
        getSession: store, loadCompanyData: async () => company,
        replyToMessage: (...args) => {
          assert.deepEqual(args[8].activeGuides, ["noStart"]);
          args[6] = async request => {
            calls++;
            return answer(request, { guideActions: { noStart: action } });
          };
          return getReply(...args);
        },
        sendConfirmation: () => { throw Error("No mail in guide tests"); },
      });
    }
    const request = id => ({
      headers: { cookie: "caro_session=" + first.id }, ip: "legacy-guide-test",
      body: { message: "cvaka", messageId: id },
    });
    let out = response();
    await handler()(request("legacy-1"), out);
    assert.equal(out.code, 200);
    assert.deepEqual(repository.load(first.id).activeGuides, ["noStart"]);
    assert.equal(Object.hasOwn(repository.load(first.id), "activeGuide"), false);
    store = createChatSessionStore({ repository });
    action = "clear"; out = response();
    await handler()(request("legacy-2"), out);
    assert.equal(out.code, 200);
    assert.deepEqual(repository.load(first.id).activeGuides, []);
    assert.deepEqual(readActiveGuideIds(repository.load(first.id)), []);
    assert.equal(calls, 2);
  } finally { repository.close(); }
});
