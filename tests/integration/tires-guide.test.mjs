import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tiresGuide } from "../../guides/tires.mjs";
import { buildInstructions } from "../../instructions.mjs";
import { getReply } from "../../service.mjs";
import { getPriceQuote } from "../../pricing.mjs";
import { emptyIntakeState } from "../../intake.mjs";
import { readyToSend, presentRequestStep } from "../../request-flow.mjs";
import { createChatHandler, createSessionHandler } from "../../chat-route.mjs";
import { createChatSessionStore } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";
const company = JSON.parse(readFileSync(new URL("../../company.json", import.meta.url), "utf8"));

function draft(includeTires = true) {
  const state = emptyIntakeState();
  const appointment = new Date();
  appointment.setUTCDate(appointment.getUTCDate() + 14 + ((8 - appointment.getUTCDay()) % 7));
  Object.assign(state, {
    intent: "service_request",
    selectedOperations: ["oil_filters:engine_oil", ...(includeTires ? ["tires:seasonal_tires"] : [])],
    serviceId: "oil_filters", serviceOptionId: "engine_oil",
    requestedWork: "Výměna oleje a olejového filtru" + (includeTires ? "; přezutí dvou předních pneumatik" : ""),
    customerParts: false, oilFilterScopeReviewed: true,
    additionalServicesReviewed: true, preferredTime: appointment.toISOString().slice(0, 10),
  });
  Object.assign(state.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,3 l", fuel: "benzín" });
  Object.assign(state.customer, { name: "Test", email: "test@example.com" });
  if(includeTires) state.tires={optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"};
  return state;
}
function answer(request, next, actions = {}) {
  const data = {
    safetyWarning: "", reply: next.pendingDetails.length ? "Jaký průměr mají ráfky?" : "Dobře.",
    language: "cs", priceQuoted: false, replyLead: "", tireUpdate: {reset:false,fields:["optionId","quantity","rimDiameter","material"]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction: "keep",
    tirePriceRequest: null, oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake: structuredClone(next), submissionAction: "none",
  };
  const definitions = request.text.format.schema.properties.guideActions?.properties;
  if (definitions) data.guideActions = Object.fromEntries(Object.keys(definitions).map(id => [id, actions[id] ?? "keep"]));
  return { status: "completed", output: [], output_text: JSON.stringify(data) };
}
function tool(ids) {
  return { status: "completed", output: [{
    type: "function_call", name: "load_guides", call_id: "tires-load",
    arguments: JSON.stringify({ guideIds: ids }),
  }] };
}

for (const activeGuides of [[], ["tires"], ["noStart", "tires"]]) {
  test("tire instructions are conditional and shared policies remain: " + JSON.stringify(activeGuides), () => {
    const text = buildInstructions({ company, priceBooks: {}, currentPragueDate: "27. října 2026", activeGuides });
    assert.equal(text.split(tiresGuide.instructions).length - 1, activeGuides.includes("tires") ? 1 : 0);
    const line = text.split("\n").find(x => x.startsWith("Firemní data: "));
    const supplied = JSON.parse(line.slice("Firemní data: ".length));
    assert.deepEqual(supplied.services, company.services);
    assert.equal(Object.hasOwn(supplied.symptomGuide, "tires"), false);
  });
}

test("oil plus tires automatically includes tire rules with required keep and preserves both operations", async () => {
  const state = draft();
  const before = structuredClone(state);
  let calls = 0;
  const result = await getReply("16 palců", company, [], state, undefined, false, async request => {
    calls++;
    assert.ok(request.instructions.includes(tiresGuide.instructions));
    assert.deepEqual(request.text.format.schema.properties.guideActions.properties.tires.enum, ["keep"]);
    assert.ok(!request.tools[0].parameters.properties.guideIds.items.enum.includes("tires"));
    return answer(request, state);
  });
  assert.equal(result.kind, "reply");
  assert.equal(calls, 1);
  assert.deepEqual(result.activeGuides, [], "service-bound guide need not be persisted as a temporary topic");
  assert.deepEqual(result.intake.selectedOperations, state.selectedOperations);
  assert.deepEqual(result.intake.vehicle, state.vehicle);
  assert.deepEqual(state, before);
});

test("informational tire inquiry loads guide without selecting work or creating a booking", async () => {
  const state = emptyIntakeState();
  state.intent = "service_discussion";
  let calls = 0;
  const result = await getReply("Kolik stojí přezutí dvou pneumatik?", company, [], state, undefined, false,
    async request => ++calls === 1 ? tool(["tires"]) : answer(request, state));
  assert.equal(result.kind, "reply");
  assert.equal(calls, 2);
  assert.deepEqual(result.activeGuides, ["tires"]);
  assert.deepEqual(result.intake.selectedOperations, null);
  assert.equal(result.intake.intent, "service_discussion");
  assert.equal(result.submissionAction, "none");
});

test("backend refuses clearing service-bound tire guide while the job remains selected", async () => {
  const state = draft();
  const result = await getReply("Jiná otázka", company, [], state, undefined, false,
    async request => answer(request, state, { tires: "clear" }));
  assert.equal(result.kind, "unavailable");
});

test("a temporary symptom may clear without removing tire rules or selected oil and tires", async () => {
  const state = draft();
  const result = await getReply("Cukání teď neřešme", company, [], state, undefined, false,
    async request => {
      assert.deepEqual(request.text.format.schema.properties.guideActions.properties.tires.enum, ["keep"]);
      return answer(request, state, { jerkingDuringAcceleration: "clear", tires: "keep" });
    }, false, { activeGuides: ["jerkingDuringAcceleration"] });
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.activeGuides, []);
  assert.deepEqual(result.intake.selectedOperations, state.selectedOperations);
});

test("explicit removal of tire work stops automatic inclusion on the next request", async () => {
  const initial = draft();
  const next = draft(false);
  const removed = await getReply("Přezutí ruším, ponechte jen olej", company, [], initial, undefined, false,
    async request => answer(request, next));
  assert.equal(removed.kind, "reply");
  assert.deepEqual(removed.activeGuides, []);
  let request;
  const followUp = await getReply("ano", company, [], removed.intake, undefined, false,
    async params => { request = params; return answer(params, removed.intake); },
    false, { activeGuides: removed.activeGuides });
  assert.equal(followUp.kind, "reply");
  assert.ok(!request.instructions.includes(tiresGuide.instructions));
  assert.deepEqual(followUp.intake.selectedOperations, ["oil_filters:engine_oil"]);
});

for (const option of ["seasonal_tires", "wheel_swap"]) {
  test("model receives authoritative price tables for 1, 2 and 4 wheels: " + option, async () => {
    const state = draft();
    state.selectedOperations[1] = "tires:" + option;
    const quote = getPriceQuote(company, "tires", option);
    let request;
    await getReply("cenu pro dvě kola", company, [], state, undefined, false,
      async params => { request = params; return answer(params, state); });
    const line = request.instructions.split("\n").find(x => x.startsWith("Ceníky: "));
    const books = JSON.parse(line.slice("Ceníky: ".length));
    for (const quantity of [1, 2, 4]) {
      for (const key of Object.keys(quote.variantsKc)) {
        assert.equal(quote.pricesByQuantityKc[quantity][key], quote.variantsKc[key] * quantity / 4);
        assert.equal(books.serviceParts["tires:" + option].pricesByQuantityKc[quantity][key], quote.pricesByQuantityKc[quantity][key]);
        assert.equal(books.customerParts["tires:" + option].pricesByQuantityKc[quantity][key], quote.pricesByQuantityKc[quantity][key]);
      }
    }
  });
}

for (const field of ["tires.rimDiameter", "tires.quantity", "tires.operation"]) {
  test("pending tire clarification blocks a summary without losing other work: " + field, () => {
    const state = draft();
    state.pendingDetails = [field];
    assert.equal(readyToSend(state, company), false);
    const text = presentRequestStep("Prosím upřesnit.", state, { company });
    assert.equal(text, "Prosím upřesnit.");
    assert.deepEqual(state.selectedOperations, ["oil_filters:engine_oil", "tires:seasonal_tires"]);
  });
}

test("unknown rim material may be left for the service after diameter is known", () => {
  const state = draft();
  state.requestedWork += ", ráfky 16 palců; materiál ráfků upřesní servis";
  assert.equal(readyToSend(state, company), true);
  const text = presentRequestStep("Dobře.", state, { company });
  assert.match(text, /16 palců/);
  assert.match(text, /materiál ráfků upřesní servis/);
  assert.match(text, /Výměna oleje/);
  assert.match(text, /Zkontrolujte/);
});

function response() {
  return Object.assign(new EventEmitter(), {
    locals: {}, writableEnded: false, destroyed: false, code: 200,
    cookie() {}, set() { return this; }, json(body) { this.body = body; return this; },
    status(code) { this.code = code; return this; },
  });
}
let sequence = 0;
async function chat(handler, id, message, extra = {}) {
  const out = response();
  await handler({ headers: { cookie: "caro_session=" + id }, ip: "tires-test",
    body: { message, messageId: "tires-test-" + (++sequence), ...extra } }, out);
  assert.equal(out.code, 200, JSON.stringify(out.body));
  return out;
}
function handlerFor(store, model) {
  return createChatHandler({
    getSession: store, loadCompanyData: async () => company,
    replyToMessage: (...args) => { args[6] = model; return getReply(...args); },
    sendConfirmation: () => { throw Error("Mail is forbidden in tire tests"); },
  });
}

test("adding tires after oil keeps the request open until diameter is answered, then survives reload", async () => {
  const repository = createRepository();
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "tires-test" }, response());
    first.intake = draft(false); first.persist();
    const pending = draft();
    pending.tires.rimDiameter=null;
    pending.pendingDetails = ["tires.rimDiameter"];
    let calls = 0;
    const added = await chat(handlerFor(store, async request =>
      ++calls === 1 ? tool(["tires"]) : answer(request, pending)), first.id, "Přidejte dvě přední pneumatiky, materiál ráfků neznám");
    assert.equal(calls, 2);
    assert.equal(added.body.confirmationToken, null);
    assert.doesNotMatch(added.body.reply, /Zkontrolujte prosím žádost/);
    assert.deepEqual(repository.load(first.id).intake.pendingDetails, ["tires.rimDiameter"]);
    assert.deepEqual(repository.load(first.id).intake.selectedOperations, pending.selectedOperations);
    assert.deepEqual(repository.load(first.id).activeGuides, []);
    store = createChatSessionStore({ repository });
    const clarified = draft();
    clarified.requestedWork += ", 16 palců; materiál ráfků upřesní servis";
    let followCalls = 0;
    const result = await chat(handlerFor(store, async request => {
      followCalls++;
      assert.ok(request.instructions.includes(tiresGuide.instructions));
      assert.deepEqual(request.text.format.schema.properties.guideActions.properties.tires.enum, ["keep"]);
      return answer(request, clarified);
    }), first.id, "16, materiál nevím");
    assert.equal(followCalls, 1);
    assert.ok(result.body.confirmationToken);
    assert.match(result.body.reply, /Zkontrolujte/);
    assert.deepEqual(repository.load(first.id).intake.selectedOperations, pending.selectedOperations);
    assert.ok(!JSON.stringify(result.body).includes("guideActions"));
  } finally { repository.close(); }
});

test("browser fields cannot remove a required tire guide and reset removes its selected work", async () => {
  const repository = createRepository();
  try {
    const store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "tires-test" }, response());
    first.intake = draft(); first.intake.pendingDetails = ["tires.rimDiameter"]; first.persist();
    let captured;
    await chat(handlerFor(store, async request => {
      captured = request; return answer(request, first.intake);
    }), first.id, "16", { activeGuides: [], intake: { selectedOperations: [] } });
    assert.ok(captured.instructions.includes(tiresGuide.instructions));
    const reset = response();
    createSessionHandler({ getSession: store, reset: true })({
      headers: { cookie: "caro_session=" + first.id }, body: {},
    }, reset);
    assert.deepEqual(repository.load(first.id).intake.selectedOperations, null);
    let afterReset;
    const state = emptyIntakeState();
    await chat(handlerFor(store, async request => {
      afterReset = request; return answer(request, state);
    }), first.id, "Dobrý den");
    assert.ok(!afterReset.instructions.includes(tiresGuide.instructions));
  } finally { repository.close(); }
});

for (const [name, message, withOil, option] of [
  ["first tire booking", "Potřebuji přezout dvě přední pneumatiky", false, "seasonal_tires"],
  ["first tire price inquiry", "Kolik stojí přezutí pneumatik?", false, null],
  ["first complete-wheel swap", "Potřebuji vyměnit kompletní kola", false, "wheel_swap"],
  ["adding tires to oil", "Ještě přidejte přezutí dvou předních pneumatik", true, "seasonal_tires"],
]) {
  test("first tire turn consumes the loaded guide before returning booking or price information: " + name, async () => {
    const initial = withOil ? draft(false) : emptyIntakeState();
    const before = structuredClone(initial);
    const next = structuredClone(initial);
    if (option) {
      next.intent = "service_request";
      next.selectedOperations = [...(initial.selectedOperations ?? []), "tires:" + option];
      next.requestedWork = [initial.requestedWork, "Přezutí / výměna kol"].filter(Boolean).join("; ");
      next.pendingDetails = ["tires.rimDiameter"];
    } else next.intent = "service_discussion";
    const requests = [];
    const result = await getReply(message, company, [], initial, undefined, false, async request => {
      requests.push(request);
      if (requests.length === 1) {
        assert.ok(!request.instructions.includes(tiresGuide.instructions));
        assert.ok(request.tools[0].parameters.properties.guideIds.items.enum.includes("tires"));
        return tool(["tires"]);
      }
      assert.ok(request.instructions.includes(tiresGuide.instructions));
      assert.equal(request.tool_choice, "none");
      assert.ok(request.input.some(item => item.type === "function_call_output" && item.call_id === "tires-load"));
      return answer(request, next);
    });
    assert.equal(requests.length, 2);
    assert.equal(result.kind, "reply");
    assert.equal(result.submissionAction, "none");
    assert.deepEqual(result.intake.selectedOperations, next.selectedOperations);
    assert.deepEqual(result.activeGuides, option ? [] : ["tires"]);
    assert.deepEqual(initial, before);
    if (withOil) {
      assert.deepEqual(result.intake.vehicle, initial.vehicle);
      assert.deepEqual(result.intake.customer, initial.customer);
    }
  });
}
