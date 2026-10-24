import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyIntakeState } from "./intake.mjs";
import { renderOilQuotes } from "./oil-quotes.mjs";
import { getReply } from "./service.mjs";
const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
const ids = ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"];
const requests = ids.map((optionId) => ({ optionId, source: "selected" }));
function state(base = false, ownOil = true) {
  const intake = emptyIntakeState();
  intake.customerParts = base;
  if (ownOil) intake.partsOverrides.engineOil = true;
  return intake;
}
test("table amounts come from the server catalog for each separate operation", () => {
  const result = renderOilQuotes(company, state(), requests, "requested");
  assert.deepEqual(result.records.map((row) => row.variants[0].priceFromKc), [500, 200, 200, 400, 400]);
  assert.match(result.text, /Výměna palivového filtru \| 400 Kč/);
  assert.match(result.text, /Výměna jednoho LPG filtru \| 400 Kč/);
});
test("automatic updates show only changed operations, including a later change back", () => {
  const initial = renderOilQuotes(company, state(false, false), requests, "automatic");
  const changed = renderOilQuotes(company, state(), requests, "automatic", initial.records);
  assert.deepEqual(changed.records.map((row) => row.optionId), ["engine_oil"]);
  const repeated = renderOilQuotes(company, state(), requests, "automatic", [...initial.records, ...changed.records]);
  assert.equal(repeated.text, "");
  const back = renderOilQuotes(company, state(false, false), requests, "automatic", [...initial.records, ...changed.records]);
  assert.deepEqual(back.records.map((row) => row.optionId), ["engine_oil"]);
  assert.equal(back.records[0].variants[0].priceFromKc, 400);
});
test("an explicit price question repeats requested prices", () => {
  const first = renderOilQuotes(company, state(), requests, "automatic");
  assert.equal(renderOilQuotes(company, state(), requests, "requested", first.records).records.length, 5);
});
test("choosing a previously compared supplier does not automatically repeat the same price", () => {
  const comparison = renderOilQuotes(company, state(), [{ optionId: "engine_oil", source: "compare" }], "requested");
  assert.match(comparison.text, /400 Kč \| 500 Kč/);
  assert.equal(renderOilQuotes(company, state(), [requests[0]], "automatic", comparison.records).records.length, 0);
});
test("hypothetical quote uses the alternative tariff without requiring a persisted choice", () => {
  const current = state(false, false);
  const result = renderOilQuotes(company, current, [{ optionId: "engine_oil", source: "customer" }], "requested");
  assert.equal(result.records[0].variants[0].priceFromKc, 500);
  assert.equal(current.partsOverrides.engineOil, null);
});
test("an alternative quote does not make the unchanged current price new again", () => {
  const current = state(false, false);
  const first = renderOilQuotes(company, current, requests, "automatic");
  const alternative = renderOilQuotes(company, current, [{ optionId: "engine_oil", source: "customer" }], "requested", first.records);
  const same = renderOilQuotes(company, current, requests, "automatic", [...first.records, ...alternative.records]);
  assert.equal(same.records.length, 0);
});
test("all customer parts do not get a service-material charge note", () => {
  const result = renderOilQuotes(company, state(true, false), requests, "requested");
  assert.doesNotMatch(result.text, /Cenu materiálu/);
});
async function modeled(payload, initial) {
  return getReply("Test", company, [], initial, undefined, false, async () => ({ status: "completed", output_text: JSON.stringify(payload) }));
}
function payload(initial) {
  return { safetyWarning: "", reply: "Jasně.", language: "cs", priceQuoted: true, keepClosedDay: false, needsClarification: false, statusFollowUp: "", submissionAction: "none", intake: structuredClone(initial), partsAction: "keep", oilPriceMode: "requested", oilPriceRequests: [requests[0]], oilPriceFollowUp: "Jaký termín Vám vyhovuje?" };
}
test("a hypothetical response cannot overwrite suppliers when partsAction is keep", async () => {
  const initial = state(false, false);
  const response = payload(initial);
  response.intake.customerParts = true;
  response.intake.partsOverrides.engineOil = true;
  response.oilPriceRequests[0] = { optionId: "engine_oil", source: "customer" };
  const result = await modeled(response, initial);
  assert.equal(result.kind, "reply");
  assert.equal(result.intake.customerParts, false);
  assert.equal(result.intake.partsOverrides.engineOil, null);
  assert.match(result.text, /500 Kč/);
});
test("free text with an extra model-written price is rejected instead of contradicting the server table", async () => {
  const initial = state();
  const response = payload(initial);
  response.reply = "Palivový filtr stojí 200 Kč.";
  assert.equal((await modeled(response, initial)).kind, "unavailable");
});

// Calendar fixtures below are evaluated relative to this fixed Prague date.
import { beforeEach } from "node:test";
beforeEach(t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-20T08:00:00Z") });
});
