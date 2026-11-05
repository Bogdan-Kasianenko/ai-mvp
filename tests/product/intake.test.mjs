import { createTestCompany } from "../fixtures/company.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyIntakeState,
  intakeResponseSchema,
  missingIntakeFields,
  normalizeIntakeState
} from "../../intake.mjs";

const company = createTestCompany();

test("brake pad request keeps discs separate and optional details do not block intake", () => {
  const state = normalizeIntakeState({
    ...emptyIntakeState(),
    intent: "service_request",
    selectedOperations: ["brakes:brake_pads"],
    serviceId: "brakes",
    serviceOptionId: "brake_pads",
    requestedWork: "Výměna předních brzdových destiček",
    vehicle: { brand: "Škoda", model: "Octavia", year: "2018" },
    customer: { name: "Jan Novák", phone: "+420 123 456 789" },
    preferredTime: "Pátek odpoledne"
  }, company);

  assert.equal(state.serviceId, "brakes");
  assert.equal(state.serviceOptionId, "brake_pads");
  assert.match(state.requestedWork, /destiček/);
  assert.doesNotMatch(state.requestedWork, /kotouč/);
  assert.deepEqual(missingIntakeFields(state), []);
  assert.equal(state.problem.lastOilChange, null);
});

test("unknown or declined details are not requested repeatedly", () => {
  const state = normalizeIntakeState({
    intent: "service_request",
    requestedWork: "Výměna oleje",
    skipped: ["vehicle.year", "customer.contact", "vehicle.year", "problem.lastOilChange"]
  }, company);

  assert.deepEqual(state.skipped, ["vehicle.year", "customer.contact", "problem.lastOilChange"]);
  assert.deepEqual(missingIntakeFields(state), [
    "selectedOperations", "vehicle.brand", "vehicle.model", "preferredTime", "customer.name", "customer.contact"
  ]);
});

test("untrusted state cannot add unlisted services or arbitrary fields", () => {
  const state = normalizeIntakeState({
    intent: "service_request",
    serviceId: "unlisted_repair",
    serviceOptionId: "brake_pads",
    vehicle: { brand: "Škoda", secret: "ignore" },
    skipped: ["unknown", "vehicle.year"]
  }, company);

  assert.equal(state.serviceId, null);
  assert.equal(state.serviceOptionId, null);
  assert.equal(state.vehicle.brand, "Škoda");
  assert.equal("secret" in state.vehicle, false);
  assert.deepEqual(state.skipped, ["vehicle.year"]);
});

test("structured response schema requires every known field", () => {
  function check(schema) {
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      Object.values(schema.properties).forEach(check);
    }
  }

  check(intakeResponseSchema);
});
