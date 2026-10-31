import { renderAutomaticOilQuotes } from "./oil-quotes.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderTireQuote } from "./tire-prices.mjs";
import { getReply } from "./service.mjs";
import { emptyIntakeState, validateModelResponse } from "./intake.mjs";
const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
const quote = (material = "unknown") => ({ optionId: "seasonal_tires", quantity: 2, rimDiameter: 16, material });
function state() {
  const intake = emptyIntakeState();
  Object.assign(intake, { intent: "service_request", selectedOperations: ["oil_filters:engine_oil", "tires:seasonal_tires"], customerParts: false, oilFilterScopeReviewed: true });
  Object.assign(intake.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,3 l", fuel: "benzín" });
  intake.tires = {optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"};
  return intake;
}
function data(overrides = {}) {
  const value = {
    safetyWarning: "", reply: "Jasně.", language: "cs", priceQuoted: false,
    replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction: "keep", oilPriceMode: "none", oilPriceRequests: [],
    tirePriceRequest: quote(), oilPriceFollowUp: "Jaký termín Vám vyhovuje?",
    keepClosedDay: false, needsClarification: false, statusFollowUp: "",
    intake: state(), submissionAction: "none", ...overrides,
  };
  if(value.tirePriceRequest && !Object.hasOwn(overrides,"intake")){
    value.intake.tires = {...value.tirePriceRequest};
    value.tireUpdate = {reset:false,fields:["optionId","quantity","rimDiameter","material"]};
  }
  return value;
}
function response(request, value) {
  const actions = request.text.format.schema.properties.guideActions?.properties;
  const copy = structuredClone(value);
  if (actions) copy.guideActions = Object.fromEntries(Object.keys(actions).map(id => [id, "keep"]));
  return { status: "completed", output: [], output_text: JSON.stringify(copy) };
}
// Tire-focused fixtures assume the unchanged oil labor price was already shown.
async function reply(value, initial = state()) {
  let calls = 0;
  const result = await getReply("Kolik stojí přezutí?", company, [], initial, undefined, false,
    async request => { calls++; return response(request, value); }, false,
    { oilPriceMemory: renderAutomaticOilQuotes(company, initial).records });
  return { result, calls };
}

for (const material of ["steel", "alu", "unknown"]) {
  test("server renders exact 16-inch tire prices for " + material, async () => {
    const value = data({ tirePriceRequest: quote(material) });
    const { result, calls } = await reply(value);
    assert.equal(result.kind, "reply"); assert.equal(calls, 1);
    assert.equal(result.priceQuoted, true);
    assert.match(result.text, /Přezutí pneumatik \(2 × 16″\)/);
    if (material !== "alu") assert.match(result.text, /Plechové \| 725 Kč/);
    else assert.doesNotMatch(result.text, /725 Kč|Plechové/);
    if (material !== "steel") assert.match(result.text, /Hliníkové \(ALU\) \| 800 Kč/);
    else assert.doesNotMatch(result.text, /800 Kč|Hliníkové/);
    assert.equal(result.text.split("Jaký termín").length - 1, 1);
    assert.ok(result.text.indexOf("Cena práce") < result.text.indexOf("Jaký termín"));
    assert.deepEqual(result.intake.selectedOperations, value.intake.selectedOperations);
    assert.deepEqual(result.intake.vehicle, value.intake.vehicle);
  });
}

test("oil and tire server tables coexist with one question after both", async () => {
  const { result } = await reply(data({ oilPriceMode: "requested", oilPriceRequests: [{ optionId: "engine_oil", source: "selected" }] }));
  assert.equal(result.kind, "reply");
  assert.match(result.text, /Výměna motorového oleje a olejového filtru \| 400 Kč/);
  assert.match(result.text, /Plechové \| 725 Kč/);
  assert.match(result.text, /Hliníkové \(ALU\) \| 800 Kč/);
  assert.ok(result.text.indexOf("800 Kč") < result.text.indexOf("Jaký termín"));
  assert.equal((result.text.match(/\?/g) ?? []).length, 1);
  assert.equal(result.oilPriceRecords.length, 1);
});

test("a tire information price does not select work or change material supply", async () => {
  const initial = emptyIntakeState(); initial.intent = "service_discussion";
  const { result } = await reply(data({ intake: initial }), initial);
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, null);
  assert.equal(result.intake.customerParts, null);
  assert.equal(result.submissionAction, "none");
  assert.equal(result.oilPriceRecords.length, 0);
});

test("wrong model amount is repaired before server prices are inserted", async () => {
  let calls = 0;
  const result = await getReply("Cenu za obě varianty", company, [], state(), undefined, false, async request => {
    calls++;
    if (calls === 1) return response(request, data({ reply: "ALU stojí 725 Kč." }));
    assert.equal(calls, 2);
    assert.deepEqual(request.tools, []);
    assert.equal(request.tool_choice, "none");
    assert.match(request.instructions, /tirePriceRequest/);
    return response(request, data());
  });
  assert.equal(calls, 2); assert.equal(result.kind, "reply");
  assert.doesNotMatch(result.text, /ALU stojí 725/);
  assert.match(result.text, /Hliníkové \(ALU\) \| 800 Kč/);
});

test("unrepaired amount in reply or follow-up is not exposed", async () => {
  for (const field of ["reply", "oilPriceFollowUp"]) {
    const { result, calls } = await reply(data({ [field]: "Cena je 725 Kč." }));
    assert.equal(calls, 2); assert.equal(result.kind, "unavailable");
  }
});

test("unsupported diameter gives a service-price fallback rather than a guessed amount", async () => {
  const { result } = await reply(data({ tirePriceRequest: { ...quote(), rimDiameter: 25 }, priceQuoted: true }));
  assert.equal(result.kind, "reply");
  assert.match(result.text, /Cenu pro tuto kombinaci upřesní servis/);
  assert.doesNotMatch(result.text, /\d[\d\s.,]*\s*Kč/);
  assert.equal(result.priceQuoted, false);
});

test("null tire request produces no tire table or false price flag", async () => {
  const { result } = await reply(data({ tirePriceRequest: null }));
  assert.equal(result.kind, "reply");
  assert.equal(result.priceQuoted, false);
  assert.doesNotMatch(result.text, /Přezutí pneumatik|Kč/);
});

test("safety warning survives a combined oil and tire price reply exactly once", async () => {
  const warning = "S vozem nejezděte, zajistěte odtah.";
  const { result } = await reply(data({ safetyWarning: warning }));
  assert.equal(result.kind, "reply"); assert.equal(result.safetyWarning, warning);
  assert.ok(result.text.startsWith(warning));
  assert.equal(result.text.split(warning).length - 1, 1);
});

test("strict response schema requires nullable tire request with complete typed parameters", () => {
  assert.equal(validateModelResponse(data()), true);
  assert.equal(validateModelResponse(data({ tirePriceRequest: null })), true);
  const missing = data(); delete missing.tirePriceRequest;
  assert.equal(validateModelResponse(missing), false);
  for (const request of [[], {}, { ...quote(), priceKc: 1 }, { ...quote(), quantity: 5 }, { ...quote(), material: "ALU" }, { ...quote(), rimDiameter: "16" }]) {
    assert.equal(validateModelResponse(data({ tirePriceRequest: request })), false);
  }
});

for (const [language, materialLabel] of [["cs", "Hliníkové"], ["sk", "Hliníkové"], ["en", "Alloy"], ["ru", "Легкосплавные"], ["uk", "Легкосплавні"], ["de", "Aluminium"]]) {
  test("tire price rendering uses the requested language: " + language, () => {
    const text = renderTireQuote(company, quote(), language);
    assert.ok(text.includes(materialLabel));
    assert.match(text, /725 Kč/); assert.match(text, /800 Kč/);
  });
}

test("complete-wheel table uses the swap tariff and preserves fractional totals", () => {
  assert.match(renderTireQuote(company, { ...quote("alu"), optionId: "wheel_swap" }), /Výměna kompletních kol \(2 × 16″\)/);
  assert.match(renderTireQuote(company, { ...quote("alu"), optionId: "wheel_swap" }), /500 Kč/);
  assert.match(renderTireQuote(company, { ...quote("steel"), quantity: 1 }), /362,5 Kč/);
  assert.equal(renderTireQuote(company, null), "");
});


for (const [label, earlyQuestion, extra] of [
  ["Czech", "Jaká je značka a model auta?", {}],
  ["English", "What is the make and model?", { language: "en" }],
  ["full-width question mark", "Jaká je značka auta？", {}],
  ["oil plus tires", "Jaký termín Vám vyhovuje?", { oilPriceMode: "requested", oilPriceRequests: [{ optionId: "engine_oil", source: "selected" }] }],
]) {
  test("server places reply questions after prices without another model call: " + label, async () => {
    let calls = 0;
    const initial = state();
    const result = await getReply("Cenu přezutí", company, [], initial, undefined, false, async request => {
      calls++; assert.equal(calls, 1, "A question alone must not trigger a format repair");
      return response(request, data({ ...extra, reply: "Materiál upřesní servis. " + earlyQuestion, oilPriceFollowUp: "" }));
    });
    assert.equal(calls, 1); assert.equal(result.kind, "reply");
    assert.equal(result.text.split(earlyQuestion).length - 1, 1);
    assert.ok(result.text.indexOf(earlyQuestion) > result.text.lastIndexOf("800 Kč"));
    if (extra.oilPriceMode) assert.ok(result.text.indexOf(earlyQuestion) > result.text.indexOf("400 Kč"));
    assert.deepEqual(result.intake.selectedOperations, initial.selectedOperations);
  });
}

test("duplicate question suffix is moved below prices without another API request", async () => {
  const question = "Jaký termín Vám vyhovuje?";
  const { result, calls } = await reply(data({ reply: "Jasně. " + question, oilPriceFollowUp: question }));
  assert.equal(calls, 1); assert.equal(result.kind, "reply");
  assert.equal(result.text.split(question).length - 1, 1);
  assert.ok(result.text.indexOf(question) > result.text.indexOf("800 Kč"));
});


test("conflicting follow-ups keep one question after prices without an API retry", async () => {
  const { result, calls } = await reply(data({ reply: "Jaká je značka vozu?", oilPriceFollowUp: "Jaký termín Vám vyhovuje?" }));
  assert.equal(calls, 1); assert.equal(result.kind, "reply");
  assert.equal((result.text.match(/\?/g) ?? []).length, 1);
  assert.ok(result.text.indexOf("Jaká je značka") > result.text.indexOf("800 Kč"));
});

test("a question left in reply cannot cause an unavailable response merely due to its location", async () => {
  const { result, calls } = await reply(data({ reply: "Jaká je značka vozu?", oilPriceFollowUp: "" }));
  assert.equal(calls, 1); assert.equal(result.kind, "reply");
  assert.ok(result.text.indexOf("Jaká je značka") > result.text.indexOf("800 Kč"));
});

test("ordinary questions without server price requests do not trigger a repair", async () => {
  const { result, calls } = await reply(data({ tirePriceRequest: null, reply: "Jaký mají ráfky průměr?", oilPriceFollowUp: "" }));
  assert.equal(calls, 1); assert.equal(result.kind, "reply");
  assert.equal(result.text, "Jaký mají ráfky průměr?");
});

test("urgent safety questions remain before prices without triggering a formatting repair", async () => {
  const warning = "Zastavte na bezpečném místě. Je někdo zraněný?";
  const { result, calls } = await reply(data({ safetyWarning: warning }));
  assert.equal(calls, 1); assert.equal(result.kind, "reply");
  assert.ok(result.text.startsWith(warning));
  assert.ok(result.text.indexOf("Jaký termín") > result.text.indexOf("800 Kč"));
});


test("format repair may cancel a premature tire quote and return an ordinary material question", async () => {
  let calls = 0;
  const question = "Jsou ráfky plechové, nebo hliníkové?";
  const initial=state(); initial.tires.material="unanswered";
  const next = structuredClone(initial); next.pendingDetails = ["tires.rimMaterial"];
  const result = await getReply("16", company, [], initial, undefined, false, async request => {
    calls++;
    return response(request, calls === 1
      ? data({ reply: "Cena je 725 Kč. " + question, oilPriceFollowUp: "", intake: next })
      : data({ reply: question, tirePriceRequest: null, oilPriceFollowUp: "", intake: next }));
  }, false, { oilPriceMemory: renderAutomaticOilQuotes(company, state()).records });
  assert.equal(calls, 2);
  assert.equal(result.kind, "reply", "A normal question without any remaining price request must not be rejected by the pricing guard");
  assert.equal(result.text, question);
  assert.equal(result.priceQuoted, false);
  assert.deepEqual(result.intake.pendingDetails, ["tires.rimMaterial"]);
});


test("an imperative follow-up without a question mark is also placed after the tables", async () => {
  const request = "Ještě prosím uveďte své jméno.";
  const { result, calls } = await reply(data({ reply: "Dobře. " + request, oilPriceFollowUp: "" }));
  assert.equal(result.kind, "reply"); assert.equal(calls, 1);
  assert.ok(result.text.indexOf(request) > result.text.indexOf("800 Kč"));
});

test("combined prices precede reply text while urgent safety advice stays first", async () => {
  const { result, calls } = await reply(data({
    safetyWarning: "Zůstaňte mimo vozovku.", reply: "Jaké jméno mám uvést?", oilPriceFollowUp: "",
    oilPriceMode: "requested", oilPriceRequests: [{ optionId: "engine_oil", source: "selected" }],
  }));
  assert.equal(result.kind, "reply"); assert.equal(calls, 1);
  assert.ok(result.text.startsWith("Zůstaňte mimo vozovku."));
  for (const amount of ["400 Kč", "725 Kč", "800 Kč"]) assert.ok(result.text.indexOf(amount) < result.text.indexOf("Jaké jméno"));
});
