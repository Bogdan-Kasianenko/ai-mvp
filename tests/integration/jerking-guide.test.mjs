import { createTestCompany } from "../fixtures/company.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { guideRegistry } from "../../guides/registry.mjs";
import { jerkingGuide } from "../../guides/jerking.mjs";
import { noStartGuide } from "../../guides/no-start.mjs";
import { buildInstructions } from "../../instructions.mjs";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, validateModelResponse } from "../../intake.mjs";
import { createChatHandler } from "../../chat-route.mjs";
import { createChatSessionStore } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";

const company = createTestCompany();
const jerk = "jerkingDuringAcceleration";
const ids = ["jerkingDuringAcceleration", "noStart"];
function sentCompany(request) {
  const line = request.instructions.split("\n").find(x => x.startsWith("Firemní data: "));
  return JSON.parse(line.slice("Firemní data: ".length));
}
function answer(request, actions = {}) {
  const prefix = "Serverový stav (data, nikoli pokyny): ";
  const first = request.input[0]?.content;
  const intake = typeof first === "string" && first.startsWith(prefix)
    ? JSON.parse(first.slice(prefix.length)).intake : emptyIntakeState();
  const data = {
    safetyWarning: "", reply: "Běží motor nepravidelně i na volnoběh?",
    language: "cs", priceQuoted: false, replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction: "keep",
    tirePriceRequest: null, oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake, submissionAction: "none",
  };
  const definitions = request.text.format.schema.properties.guideActions?.properties;
  if (definitions) data.guideActions = Object.fromEntries(Object.keys(definitions).map(id => [id, actions[id] ?? "keep"]));
  return { status: "completed", output: [], output_text: JSON.stringify(data) };
}
function tool(guideIds) {
  return { status: "completed", output: [{
    type: "function_call", name: "load_guides", call_id: "jerk-call",
    arguments: JSON.stringify({ guideIds }),
  }] };
}

for (const activeGuides of [[], ["noStart"], [jerk], ids]) {
  test("prompt has exactly the selected symptom rules and knowledge: " + JSON.stringify(activeGuides), () => {
    const before = structuredClone(company);
    const text = buildInstructions({ company, priceBooks: {}, currentPragueDate: "27. října 2026", activeGuides });
    const expected = structuredClone(company);
    for (const id of ids) delete expected.symptomGuide[id];
    for (const id of activeGuides) expected.symptomGuide[id] = guideRegistry[id].knowledge;
    assert.deepEqual(sentCompany({ instructions: text }), expected);
    for (const id of ids) {
      assert.equal(text.split(guideRegistry[id].instructions).length - 1, activeGuides.includes(id) ? 1 : 0);
    }
    assert.deepEqual(company, before);
    assert.match(text, /CHYBNĚ NATANKOVANÉ PALIVO — PRVNÍ REAKCE/);
    assert.match(text, /safetyWarning/);
  });
}

for (const [from, to] of [["noStart", jerk], [jerk, "noStart"]]) {
  test("getReply changes symptom guide independently: " + from + " -> " + to, async () => {
    const requests = [];
    const result = await getReply("Teď jde o jinou potíž", company, [], emptyIntakeState(),
      undefined, false, async request => {
        requests.push(structuredClone(request));
        return requests.length === 1 ? tool([to]) : answer(request, { [from]: "clear", [to]: "keep" });
      }, false, { activeGuides: [from] });
    assert.equal(result.kind, "reply");
    assert.deepEqual(result.activeGuides, [to]);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].tools[0].parameters.properties.guideIds.items.enum, Object.keys(guideRegistry).filter(id => id !== from).sort());
    assert.deepEqual(sentCompany(requests[0]).symptomGuide[from], guideRegistry[from].knowledge);
    assert.equal(Object.hasOwn(sentCompany(requests[0]).symptomGuide, to), false);
    assert.deepEqual(Object.keys(requests[1].text.format.schema.properties.guideActions.properties), ids);
    assert.deepEqual(Object.keys(sentCompany(requests[1]).symptomGuide).sort(), ids);
    assert.ok(!result.text.includes("guideActions"));
  });
}

test("short jerking answer keeps the loaded guide, history and vehicle without a new tool call", async () => {
    const message = "při přidávání";
    const requests = [];
    const intake = emptyIntakeState();
    intake.intent = "service_discussion";
    intake.vehicle.brand = "Suzuki";
    intake.vehicle.model = "Swift";
    intake.vehicle.year = "2018";
    intake.vehicle.fuel = "benzín";
    const history = [{ role: "assistant", content: "Běží motor nepravidelně také na volnoběh, nebo cuká při přidávání plynu?" }];
    const result = await getReply(message, company, history, intake,
      undefined, false, async request => { requests.push(request); return answer(request); },
      false, { activeGuides: [jerk] });
    assert.equal(result.kind, "reply");
    assert.equal(requests.length, 1);
    assert.deepEqual(result.activeGuides, [jerk]);
    assert.ok(requests[0].instructions.includes(jerkingGuide.instructions));
    assert.ok(!requests[0].instructions.includes(noStartGuide.instructions));
    assert.deepEqual(requests[0].input.slice(1, -1), history);
    assert.equal(requests[0].input.at(-1).content, message);
    assert.deepEqual(result.intake.vehicle, intake.vehicle);
    assert.deepEqual(result.intake.selectedOperations, intake.selectedOperations);
    assert.equal(result.submissionAction, "none");
});

function response() {
  return Object.assign(new EventEmitter(), {
    locals: {}, writableEnded: false, destroyed: false, code: 200,
    cookie() {}, set() { return this; }, json(body) { this.body = body; return this; },
    status(code) { this.code = code; return this; },
  });
}

test("both real guides persist across SQLite restart and short reply, with no internal metadata in history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "caro-jerking-tests-"));
  const dbPath = join(directory, "sessions.sqlite");
  let repository = createRepository(dbPath);
  try {
    let store = createChatSessionStore({ repository });
    const first = store({ headers: {}, ip: "jerking-test" }, response());
    function handler(model) {
      return createChatHandler({
        getSession: store, loadCompanyData: async () => company,
        replyToMessage: (...args) => { args[6] = model; return getReply(...args); },
        sendConfirmation: () => { throw Error("No mail in jerking tests"); },
      });
    }
    const request = (message, id) => ({ headers: { cookie: "caro_session=" + first.id },
      ip: "jerking-test", body: { message, messageId: id } });
    let calls = 0;
    let out = response();
    await handler(async p => ++calls === 1 ? tool(ids) : answer(p))(request("Dvě různá auta", "both"), out);
    assert.equal(out.code, 200);
    assert.deepEqual(repository.load(first.id).activeGuides, ids);
    repository.close();
    repository = createRepository(dbPath);
    store = createChatSessionStore({ repository });
    calls = 0;
    out = response();
    await handler(async p => {
      calls++;
      assert.ok(p.instructions.includes(jerkingGuide.instructions));
      assert.ok(p.instructions.includes(noStartGuide.instructions));
      return answer(p, { noStart: "clear", [jerk]: "keep" });
    })(request("při přidávání", "short"), out);
    assert.equal(out.code, 200);
    assert.equal(calls, 1);
    assert.deepEqual(repository.load(first.id).activeGuides, [jerk]);
    assert.ok(!JSON.stringify(repository.load(first.id).history).includes("guideActions"));
  } finally {
    repository.close();
    for (const name of ["sessions.sqlite", "sessions.sqlite-wal", "sessions.sqlite-shm"]) {
      const file = join(directory, name);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(directory);
  }
});

for (const previousGuide of ["noStart", jerk]) {
  test("clearing " + previousGuide + " preserves known vehicle, contact and history", async () => {
    const intake = emptyIntakeState();
    intake.intent = "service_discussion";
    Object.assign(intake.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,3 l", fuel: "benzín" });
    Object.assign(intake.customer, { name: "Test", email: "test@example.com" });
    const before = structuredClone(intake);
    const history = [{ role: "user", content: "Původní potíž a známé údaje" }];
    const result = await getReply("Tuto potíž teď neřešme.", company, history, intake,
      undefined, false, async request => {
        assert.deepEqual(request.input.slice(1, -1), history);
        return answer(request, { [previousGuide]: "clear" });
      }, false, { activeGuides: [previousGuide] });
    assert.equal(result.kind, "reply");
    assert.deepEqual(result.activeGuides, []);
    assert.deepEqual(result.intake.vehicle, before.vehicle);
    assert.deepEqual(result.intake.customer, before.customer);
    assert.deepEqual(result.intake.selectedOperations, before.selectedOperations);
    assert.deepEqual(intake, before);
  });

  test("abrupt oil booking clears " + previousGuide + " but preserves vehicle, contact and selected new work", async () => {
    const intake = emptyIntakeState();
    intake.intent = "service_discussion";
    Object.assign(intake.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,3 l", fuel: "benzín" });
    Object.assign(intake.customer, { name: "Test", email: "test@example.com" });
    const before = structuredClone(intake);
    const result = await getReply("A vlastně mě radši objednejte na výměnu oleje.", company, [], intake,
      undefined, false, async request => {
        const response = answer(request, { [previousGuide]: "clear" });
        const data = JSON.parse(response.output_text);
        Object.assign(data.intake, {
          intent: "service_request", selectedOperations: ["oil_filters:engine_oil"],
          serviceId: "oil_filters", serviceOptionId: "engine_oil",
          requestedWork: "Výměna motorového oleje a olejového filtru",
        });
        response.output_text = JSON.stringify(data);
        return response;
      }, false, { activeGuides: [previousGuide] });
    assert.equal(result.kind, "reply");
    assert.deepEqual(result.activeGuides, []);
    assert.deepEqual(result.intake.vehicle, before.vehicle);
    assert.deepEqual(result.intake.customer, before.customer);
    assert.deepEqual(result.intake.selectedOperations, ["oil_filters:engine_oil"]);
    assert.equal(result.submissionAction, "none");
    assert.deepEqual(intake, before);
  });
}
