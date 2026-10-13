import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPriceBook, getPriceQuote, withPublicPrices } from "./pricing.mjs";

const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));

test("oil quote contains labor only, without vehicle class or oil price", () => {
  assert.deepEqual(getPriceQuote(company, "oil_filters", "engine_oil"), {
    kind: "labor_only",
    priceFromKc: 400,
    materials: "olej a olejový filtr"
  });
});

test("customer-supplied parts use the higher hourly rate without adding parts", () => {
  const quote = getPriceQuote(
    company,
    "oil_filters",
    "engine_oil",
    company.laborRates.customerPartsKcPerHour
  );
  assert.equal(quote.kind, "labor_only");
  assert.equal(quote.priceFromKc, 500);
  assert.equal(quote.materials, "olej a olejový filtr");

for (const id of ["air_filter", "cabin_filter"]) {
  assert.equal(
    getPriceBook(
      company,
      company.laborRates.customerPartsKcPerHour
    )[`oil_filters:${id}`].priceFromKc,
    300
  );
}
  assert.equal(
    getPriceBook(company, company.laborRates.customerPartsKcPerHour)["stk:stk_arrangement"].variantsKc.inspection_and_emissions,
    3450
  );
});

test("timing service quotes labor only without part-price examples", () => {
  const quote = getPriceQuote(company, "timing_service");
  assert.equal(quote.priceFromKc, 3400);
  assert.match(quote.materials, /díly rozvodů/);
  assert.doesNotMatch(JSON.stringify(quote), /pump/i);
  const service = company.services.find((item) => item.id === "timing_service");
  assert.equal(service.name, "Výměna rozvodů");
});

test("STK and tire variants stay fixed and visible on the site", () => {
  const book = getPriceBook(company);
  assert.deepEqual(book["stk:stk_arrangement"].variantsKc, {
    inspection_only: 2450,
    inspection_and_emissions: 3450
  });
  const publicCompany = withPublicPrices(company);
  const stk = publicCompany.services.find((service) => service.id === "stk");
  assert.match(stk.options[1].priceLabel, /bez emisí: 2\s?450 Kč/);
  assert.match(stk.options[1].priceLabel, /s emisemi: 3\s?450 Kč/);
  const tires = publicCompany.services.find((service) => service.id === "tires");
  assert.match(tires.options[0].priceLabel, /ALU 19–22″/);
});

test("windshield has labor price without a glass-price example", () => {
  const quote = getPriceQuote(company, "auto_glass", "windshield");
  assert.equal(quote.kind, "labor_only");
  assert.equal(quote.priceFromKc, 1200);
  assert.equal("glassExample" in quote, false);
});

test("unlisted services have no invented price", () => {
  assert.equal(getPriceQuote(company, "insurance_repairs"), null);
  assert.equal(getPriceQuote(company, "unknown"), null);
});
