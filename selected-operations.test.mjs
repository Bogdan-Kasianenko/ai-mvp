import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  emptyIntakeState,
  missingIntakeFields,
} from "./intake.mjs";
import { readyToSend } from "./request-flow.mjs";

const company = JSON.parse(
  readFileSync(new URL("./company.json", import.meta.url), "utf8")
);

function completeRequest(requestedWork) {
  const state = emptyIntakeState();

  Object.assign(state, {
    intent: "service_request",
    selectedOperations: ["oil_filters:engine_oil"],
    serviceId: "oil_filters",
    serviceOptionId: "engine_oil",
    requestedWork,
    customerParts: null,
    oilFilterScopeReviewed: true,
    additionalServicesReviewed: true,
    preferredTime: "2099-10-26",
  });

  Object.assign(state.partsOverrides, {
    engineOil: true,
    oilFilter: true,
  });

  Object.assign(state.vehicle, {
    brand: "Suzuki",
    model: "Swift",
    year: "2018",
    engine: "1.4 l",
    fuel: "benzín",
  });

  Object.assign(state.customer, {
    name: "Test",
    email: "test@example.com",
  });

  return state;
}

test("Невыбранный фильтр в описании не требует поставщика", () => {
  const descriptions = [
    "Výměna oleje a olejového filtru bez vzduchového filtru",
    "Výmena oleja a olejového filtra bez vzduchového filtra",
    "Replace engine oil and oil filter only",
    "Замена масла и масляного фильтра без воздушного фильтра",
    "Заміна оливи та оливного фільтра без повітряного фільтра",
    "Nur Motoröl- und Ölfilterwechsel",
  ];

  for (const description of descriptions) {
    const state = completeRequest(description);

    assert.equal(readyToSend(state, company), true, description);
  }
});

test("Неуточнённая дополнительная работа блокирует отправку", () => {
  const descriptions = [
    "Výměna oleje a motoru",
    "Engine oil replacement and engine replacement",
    "Замена масла и мотора",
  ];

  for (const description of descriptions) {
    const state = completeRequest(description);
    state.selectedOperations.push("other");

    assert.ok(
      missingIntakeFields(state, company).includes("selectedOperations"),
      description
    );
    assert.equal(readyToSend(state, company), false);

    // Общий поставщик не устраняет неопределённость состава работ.
    state.customerParts = true;
    assert.equal(readyToSend(state, company), false);
  }
});

test("Добавленный фильтр требует своего поставщика", () => {
  const state = completeRequest(
    "Výměna oleje, olejového a vzduchového filtru"
  );

  state.selectedOperations.push("oil_filters:air_filter");

  assert.equal(readyToSend(state, company), false);
  assert.ok(
    missingIntakeFields(state, company).includes("customerParts")
  );

  state.partsOverrides.airFilter = false;

  assert.equal(readyToSend(state, company), true);
});

test("Старая заявка без списка работ требует уточнения", () => {
  const state = completeRequest("Výměna oleje a motoru");
  delete state.selectedOperations;

  assert.ok(
    missingIntakeFields(state, company).includes("selectedOperations")
  );
  assert.equal(readyToSend(state, company), false);
});