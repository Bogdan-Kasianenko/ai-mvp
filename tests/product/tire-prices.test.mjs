import { createTestCompany } from "../fixtures/company.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTireQuote } from "../../tire-prices.mjs";

const company = createTestCompany();
const request = (overrides = {}) => ({
  optionId: "seasonal_tires", quantity: 2, rimDiameter: 16,
  material: "unknown", ...overrides,
});
function prices(input, data = company) {
  const result = resolveTireQuote(data, input);
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.variants.map(({ material, priceKc }) => [material, priceKc]);
}

test("two 16-inch tires use distinct steel and ALU variants", () => {
  assert.deepEqual(resolveTireQuote(company, request()), {
    status: "ready", optionId: "seasonal_tires", quantity: 2, rimDiameter: 16,
    variants: [
      { material: "steel", variantId: "steel_13_16", priceKc: 725 },
      { material: "alu", variantId: "alu_15_18", priceKc: 800 },
    ],
  });
});

test("known material returns only its own price", () => {
  assert.deepEqual(prices(request({ material: "steel" })), [["steel", 725]]);
  assert.deepEqual(prices(request({ material: "alu" })), [["alu", 800]]);
});

test("quantities 1 through 4 use total prices without dividing twice or rounding", () => {
  for (const [quantity, steel, alu] of [
    [1, 362.5, 400], [2, 725, 800], [3, 1087.5, 1200], [4, 1450, 1600],
  ]) assert.deepEqual(prices(request({ quantity })), [["steel", steel], ["alu", alu]]);
});

test("rim interval boundaries are selected independently for steel and ALU", () => {
  for (const [rimDiameter, steel, alu] of [
    [13, 725, 725], [14, 725, 725], [15, 725, 800], [16, 725, 800],
    [17, 800, 800], [18, 800, 800], [19, 1000, 1000], [22, 1000, 1000],
    [23, 1150, 1150], [24, 1150, 1150],
  ]) assert.deepEqual(prices(request({ rimDiameter })), [["steel", steel], ["alu", alu]]);
});

test("complete-wheel swaps use their own tariff rather than tire fitting prices", () => {
  for (const [rimDiameter, totalForFour] of [[13, 1000], [16, 1000], [17, 1200], [20, 1200], [21, 1600], [24, 1600]]) {
    for (const quantity of [1, 2, 3, 4]) {
      const expected = totalForFour * quantity / 4;
      assert.deepEqual(prices(request({ optionId: "wheel_swap", quantity, rimDiameter })), [["steel", expected], ["alu", expected]]);
    }
  }
});

test("missing fields request clarification instead of inventing defaults", () => {
  const fields = ["optionId", "quantity", "rimDiameter", "material"];
  assert.deepEqual(resolveTireQuote(company), { status: "needs_details", missing: fields });
  for (const field of fields) {
    for (const value of [null, undefined]) {
      assert.deepEqual(resolveTireQuote(company, request({ [field]: value })), { status: "needs_details", missing: [field] });
    }
  }
});

test("unknown material is an explicit request for both prices, not a missing answer", () => {
  assert.equal(resolveTireQuote(company, request({ material: null })).status, "needs_details");
  assert.equal(resolveTireQuote(company, request({ material: "unknown" })).variants.length, 2);
});

test("invalid request shapes and unrecognized values never yield prices", () => {
  for (const input of [null, [], "16", 16, true]) {
    assert.deepEqual(resolveTireQuote(company, input), { status: "invalid_input" });
  }
  const invalid = {
    optionId: ["tread_check", "engine_oil", "seasonal_tires ", "", 1],
    quantity: [0, -1, 5, 1.5, "2", true, NaN, Infinity],
    rimDiameter: [0, -16, "16", true, NaN, Infinity],
    material: ["ALU", "plech", "", "steel_13_16", 1],
  };
  for (const [field, values] of Object.entries(invalid)) {
    for (const value of values) {
      assert.deepEqual(resolveTireQuote(company, request({ [field]: value })), { status: "invalid_input" }, field + ": " + String(value));
    }
  }
});

test("diameters outside listed intervals get no guessed or nearest price", () => {
  for (const optionId of ["seasonal_tires", "wheel_swap"]) {
    for (const rimDiameter of [12, 16.5, 24.5, 25, 100]) {
      const result = resolveTireQuote(company, request({ optionId, rimDiameter }));
      assert.equal(result.status, "unavailable");
      assert.equal(result.variants, undefined);
    }
  }
});

test("a service or option absent from the garage catalog cannot be quoted", () => {
  const withoutTires = structuredClone(company);
  withoutTires.services = withoutTires.services.filter(item => item.id !== "tires");
  assert.deepEqual(resolveTireQuote(withoutTires, request()), { status: "unavailable" });
  const withoutFitting = structuredClone(company);
  const tireService = withoutFitting.services.find(item => item.id === "tires");
  tireService.options = tireService.options.filter(item => item.id !== "seasonal_tires");
  assert.deepEqual(resolveTireQuote(withoutFitting, request()), { status: "unavailable" });
  assert.equal(resolveTireQuote(withoutFitting, request({ optionId: "wheel_swap" })).status, "ready");
});

test("tire fitting prices are independent of the garage hourly labor rates", () => {
  const otherRates = structuredClone(company);
  otherRates.laborRates.standardKcPerHour = 12345;
  otherRates.laborRates.customerPartsKcPerHour = 23456;
  assert.deepEqual(resolveTireQuote(otherRates, request()), resolveTireQuote(company, request()));
});

test("calculation leaves the company catalog and input request unchanged", () => {
  const input = request(), inputBefore = structuredClone(input), companyBefore = structuredClone(company);
  const first = resolveTireQuote(company, input);
  first.variants[0].priceKc = 0;
  assert.equal(resolveTireQuote(company, input).variants[0].priceKc, 725);
  assert.deepEqual(input, inputBefore);
  assert.deepEqual(company, companyBefore);
});
