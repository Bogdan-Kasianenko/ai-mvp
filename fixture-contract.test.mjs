import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { emptyIntakeState, missingIntakeFields, validateModelResponse } from "./intake.mjs";
import { readyToSend } from "./request-flow.mjs";
import { createChatHandler } from "./chat-route.mjs";

const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
function complete() {
  const state = emptyIntakeState();
  Object.assign(state, {
    intent: "service_request", serviceId: "oil_filters", serviceOptionId: "engine_oil",
    requestedWork: "Výměna motorového oleje a olejového filtru", customerParts: false,
    oilFilterScopeReviewed: true, additionalServicesReviewed: true, preferredTime: "2026-10-26",
  });
  Object.assign(state.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1,4 l", fuel: "benzín" });
  Object.assign(state.customer, { name: "Test", email: "test@example.com" });
  return state;
}

test("oil with service parts requires engine details or an explicit skip; own parts do not", () => {
  const state = complete();
  assert.equal(readyToSend(state, company), true);
  state.vehicle.engine = null;
  assert.ok(missingIntakeFields(state, company).includes("vehicle.engine"));
  assert.equal(readyToSend(state, company), false);
  state.skipped = ["vehicle.engine"];
  assert.equal(readyToSend(state, company), true);
  state.skipped = [];
  state.customerParts = true;
  assert.equal(readyToSend(state, company), true);
});

test("the model response must contain a boolean keepClosedDay field", () => {
  const response = {
    reply: "Děkuji.", language: "cs", priceQuoted: false, keepClosedDay: false,
    needsClarification: false, statusFollowUp: "", submissionAction: "none", intake: complete(),
  };
  assert.equal(validateModelResponse(response), true);
  const missing = { ...response };
  delete missing.keepClosedDay;
  assert.equal(validateModelResponse(missing), false);
  assert.equal(validateModelResponse({ ...response, keepClosedDay: "false" }), false);
});

test("a completed Sunday draft receives a warning without a send token or mail call", async () => {
  const state = complete();
  state.preferredTime = null;
  const session = {
    intake: state, revision: 0, history: [], language: "cs", lastDelivery: null,
    requestId: "fixture-contract", confirmation: null,
    repository: { activeCount: () => 0, allow: () => true },
    acquire: () => true, release() {}, persist() {},
  };
  let sends = 0;
  const handler = createChatHandler({
    loadCompanyData: async () => company,
    getSession: () => session,
    replyToMessage: async () => ({
      kind: "reply", text: "Termín jsem poznamenal.", language: "cs", priceQuoted: false,
      keepClosedDay: true, needsClarification: false, submissionAction: "confirm_send",
      intake: { ...structuredClone(state), preferredTime: "2026-10-25" },
    }),
    sendConfirmation: async () => { sends++; throw new Error("Unexpected sending"); },
  });
  const response = Object.assign(new EventEmitter(), {
    locals: {}, writableEnded: false,
    json(body) { this.body = body; return this; },
    status(code) { this.code = code; return this; },
  });
  await handler({ body: { message: "25.10.2026." }, ip: "test" }, response);
  assert.match(response.body.reply, /zavřeno/);
  assert.equal(response.body.intake.preferredTime, null);
  assert.equal(response.body.confirmationToken, null);
  assert.equal(sends, 0);
});
