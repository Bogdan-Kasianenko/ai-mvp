import { emptyIntakeState } from "../../intake.mjs";

// A complete oil-service draft shared by material/supplier tests.
// Arrays replace; vehicle/customer/partsOverrides accept partial field overrides.
export function createOilServiceIntake(overrides = {}) {
  const state = emptyIntakeState();
  Object.assign(state, {
    intent: "service_request", selectedOperations: ["oil_filters:engine_oil"],
    serviceId: "oil_filters", serviceOptionId: "engine_oil",
    requestedWork: "Výměna oleje a olejového filtru", customerParts: false,
    oilFilterScopeReviewed: true, additionalServicesReviewed: true,
    preferredTime: "2099-10-26",
  });
  Object.assign(state.vehicle, { brand: "Suzuki", model: "Swift", year: "2018", engine: "1.4 l", fuel: "benzín" });
  Object.assign(state.customer, { name: "Test", email: "test@example.com" });
  const { vehicle, customer, partsOverrides, ...fields } = structuredClone(overrides);
  Object.assign(state, fields);
  Object.assign(state.vehicle, vehicle);
  Object.assign(state.customer, customer);
  Object.assign(state.partsOverrides, partsOverrides);
  return state;
}
