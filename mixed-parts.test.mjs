import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyIntakeState, normalizeIntakeState, missingIntakeFields } from "./intake.mjs";
import { getPartsPriceBook } from "./pricing.mjs";
import { partSource, partsFingerprint } from "./parts-supply.mjs";
import { presentRequestStep, readyToSend } from "./request-flow.mjs";
import { buildRequestEmail } from "./mailer.mjs";
import { draftFingerprint, createChatSessionStore, prepareConfirmation, confirmationMatches } from "./chat-session.mjs";
import { createRepository } from "./storage.mjs";
import { getReply } from "./service.mjs";
const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
const ids = ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"];
function full(base = false, overrides = {}) {
  const state = emptyIntakeState();
  Object.assign(state, { intent: "service_request", selectedOperations: ids.map(id => "oil_filters:" + id), serviceId: "oil_filters", serviceOptionId: "engine_oil", customerParts: base, oilFilterScopeReviewed: true, additionalServicesReviewed: true, requestedWork: "Výměna oleje a olejového, vzduchového, kabinového, palivového a LPG filtru", preferredTime: "2026-10-26" });
  Object.assign(state.partsOverrides, overrides);
  Object.assign(state.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,4 l", fuel: "benzín + LPG" });
  Object.assign(state.customer, { name: "Test", email: "test@example.com" });
  return normalizeIntakeState(state, company);
}
function prices(state) {
  const book = getPartsPriceBook(company, state);
  return ids.map((id) => book["oil_filters:" + id].quote?.priceFromKc ?? null);
}
for (const [name, base, overrides, expected] of [
  ["all service parts", false, {}, [400, 200, 200, 400, 400]],
  ["own oil changes only the combined oil operation", false, { engineOil: true }, [500, 200, 200, 400, 400]],
  ["own oil filter changes only the combined oil operation", false, { oilFilter: true }, [500, 200, 200, 400, 400]],
  ["own LPG filter does not change the other operations", false, { lpgFilter: true }, [400, 200, 200, 400, 500]],
  ["all own parts", true, {}, [500, 300, 300, 500, 500]],
  ["own parts except a service LPG filter", true, { lpgFilter: false }, [500, 300, 300, 500, 400]],
]) test(name, () => assert.deepEqual(prices(full(base, overrides)), expected));

test("unknown supply is preserved without inventing the other suppliers", () => {
  const state = full(null, { engineOil: true });
  assert.equal(partSource(state, "engineOil"), true);
  assert.equal(partSource(state, "oilFilter"), null);
  assert.deepEqual(prices(state), [500, null, null, null, null]);
  assert.ok(missingIntakeFields(state, company).includes("customerParts"));
  assert.equal(readyToSend(state, company), false);
});
test("normalization rejects arbitrary override keys, strings and redundant choices", () => {
  const raw = full(false);
  raw.partsOverrides = { engineOil: true, airFilter: "true", fuelFilter: false, unrelated: true };
  const state = normalizeIntakeState(raw, company);
  assert.equal(state.partsOverrides.engineOil, true);
  assert.equal(state.partsOverrides.airFilter, null);
  assert.equal(state.partsOverrides.fuelFilter, null);
  assert.equal(Object.hasOwn(state.partsOverrides, "unrelated"), false);
});
test("engine details remain required when the service supplies either oil or its filter", () => {
  for (const state of [full(false, { engineOil: true }), full(true, { oilFilter: false })]) {
    state.vehicle.engine = null;
    assert.ok(missingIntakeFields(state, company).includes("vehicle.engine"));
  }
  const state = full(false, { engineOil: true, oilFilter: true });
  state.vehicle.engine = null;
  assert.ok(!missingIntakeFields(state, company).includes("vehicle.engine"));
});
test("mixed ownership is preserved in the summary and email", () => {
  const state = full(false, { engineOil: true });
  assert.match(presentRequestStep("", state, { company }), /Díly: olej: dodá zákazník; ostatní vybrané díly: zajistí servis/);
  assert.match(buildRequestEmail(state, company, "test-request"), /Díly: olej: dodá zákazník; ostatní vybrané díly: zajistí servis/);
  assert.match(presentRequestStep("", state, { company, language: "ru" }), /масло: предоставит клиент/);
});
test("old drafts and redundant overrides preserve the existing fingerprint", () => {
  const current = full();
  const old = structuredClone(current);
  delete old.partsOverrides;
  assert.equal(partsFingerprint(current), undefined);
  assert.equal(draftFingerprint(old), draftFingerprint(current));
  current.partsOverrides.engineOil = false;
  assert.equal(draftFingerprint(old), draftFingerprint(current));
});
test("changing an individual supplier invalidates consent", () => {
  const repo = createRepository();
  try {
    const store = createChatSessionStore({ repository: repo });
    const session = store({ headers: {}, secure: false }, { cookie() {}, set() {} });
    session.intake = full();
    prepareConfirmation(session);
    const token = session.confirmation.token;
    assert.equal(confirmationMatches(session, token), true);
    session.intake.partsOverrides.engineOil = true;
    assert.equal(confirmationMatches(session, token), false);
  } finally { repo.close(); }
});
test("the model receives operation-specific prices as well as both comparison books", async () => {
  const state = full(false, { engineOil: true });
  let params;
  const result = await getReply("Test", company, [], state, undefined, false, async (request) => {
    params = request;
    return { status: "completed", output_text: JSON.stringify({ reply: "Děkuji.", language: "cs", priceQuoted: false, keepClosedDay: false, needsClarification: false, statusFollowUp: "", submissionAction: "none", intake: state, partsAction: "keep", oilPriceMode: "none", oilPriceRequests: [], oilPriceFollowUp: "" }) };
  });
  assert.equal(result.kind, "reply");
  assert.ok(params.instructions.includes('"byOperation"'));
  assert.ok(params.instructions.includes('"oil_filters:engine_oil":{"customerParts":true,"quote":{"kind":"labor_only","priceFromKc":500'));
  assert.ok(params.instructions.includes('"oil_filters:lpg_filter":{"customerParts":false,"quote":{"kind":"labor_only","priceFromKc":400'));
});
