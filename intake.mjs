import { inspectAppointmentPreference } from "./appointment-calendar.mjs";
import {
  partKeys,
  emptyPartsOverrides,
  normalizePartsOverrides,
  needsOilEngine,
  hasUnspecifiedPartsSupply,
} from "./parts-supply.mjs";
import { inspectPhone, normalizePhone } from "./phone-contact.mjs";

const nullableText = { type: ["string", "null"] };

function objectSchema(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const skippedFields = [
  "vehicle.brand",
  "vehicle.model",
  "vehicle.year",
  "vehicle.engine",
  "vehicle.mileage",
  "problem.when",
  "problem.warningLights",
  "problem.otherSymptoms",
  "problem.lastOilChange",
  "customer.name",
  "customer.contact",
  "preferredTime",
];

const intakeSchema = objectSchema({
  intent: {
    type: "string",
    enum: ["general", "service_discussion", "service_request"],
  },
  customerParts: { type: ["boolean", "null"] },
  partsOverrides: objectSchema(Object.fromEntries(
    partKeys.map((key) => [key, { type: ["boolean", "null"] }]),
  )),
  oilFilterScopeReviewed: { type: "boolean" },
  additionalServicesReviewed: { type: "boolean" },
    pendingDetails: {
    type: "array",
    items: { type: "string" },
  },
  serviceId: nullableText,
  serviceOptionId: nullableText,
  requestedWork: nullableText,
  vehicle: objectSchema({
    brand: nullableText,
    model: nullableText,
    year: nullableText,
    engine: nullableText,
    fuel: nullableText,
    mileage: nullableText,
    windshieldSensors: { type: ["boolean", "null"] },
  }),
  problem: objectSchema({
    description: nullableText,
    when: nullableText,
    warningLights: nullableText,
    otherSymptoms: nullableText,
    lastOilChange: nullableText,
  }),
  customer: objectSchema({
    name: nullableText,
    phone: nullableText,
    email: nullableText,
  }),
  preferredTime: nullableText,
  skipped: { type: "array", items: { type: "string", enum: skippedFields } },
});

export const intakeResponseSchema = objectSchema({
  reply: {
    type: "string",
    description: "When oilPriceMode is requested or automatic: a short natural reaction without currency amounts, without announcing the price table, and without a follow-up question. Put that question only in oilPriceFollowUp.",
  },
  language: { type: "string", enum: ["cs", "sk", "en", "ru", "uk", "de"] },
  priceQuoted: { type: "boolean" },
   partsAction: { type: "string", enum: ["keep", "update"] },
  oilPriceMode: {
    type: "string",
    enum: ["none", "automatic", "requested"],
    description: "Use requested for ANY answer about an oil/filter labor price, including correcting a previous wrong price. Use automatic for a proactive price update. none is only for responses without an oil/filter labor price. Never put oil/filter monetary amounts in reply.",
  },
  oilPriceRequests: {
    type: "array",
    description: "Exact oil/filter operations to quote. Required whenever oilPriceMode is requested or automatic. Server supplies all amounts. Include the operation even when correcting a previously stated price.",
    items: objectSchema({
      optionId: {
        type: "string",
        enum: ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"],
      },
      source: {
        type: "string",
        enum: ["selected", "service", "customer", "compare"],
      },
    }),
  },
  oilPriceFollowUp: {
    type: "string",
    description: "One follow-up question after the price table. Do not repeat it or paraphrase it in reply. No amounts.",
  },
  keepClosedDay: { type: "boolean" },
  needsClarification: { type: "boolean" },
  statusFollowUp: { type: "string" },
  intake: intakeSchema,
  submissionAction: {
    type: "string",
    enum: ["none", "confirm_send", "decline_send", "ask_status"],
  },
});

export function emptyIntakeState() {
  return {
    intent: "general",
    customerParts: null,
    partsOverrides: emptyPartsOverrides(),
    oilFilterScopeReviewed: false,
    additionalServicesReviewed: false,
        pendingDetails: [],
    serviceId: null,
    serviceOptionId: null,
    requestedWork: null,
    vehicle: {
      brand: null,
      model: null,
      year: null,
      engine: null,
      fuel: null,
      mileage: null,
      windshieldSensors: null,
    },
    problem: {
      description: null,
      when: null,
      warningLights: null,
      otherSymptoms: null,
      lastOilChange: null,
    },
    customer: { name: null, phone: null, email: null },
    preferredTime: null,
    skipped: [],
  };
}

function cleanText(value, maxLength = 300) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

export function normalizeIntakeState(value, company) {
  const state = emptyIntakeState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return state;

  if (
    ["general", "service_discussion", "service_request"].includes(value.intent)
  ) {
    state.intent = value.intent;
  }
  if (typeof value.customerParts === "boolean") {
    state.customerParts = value.customerParts;
  }
  state.partsOverrides = normalizePartsOverrides(
    value.partsOverrides,
    state.customerParts,
  );
  state.oilFilterScopeReviewed = value.oilFilterScopeReviewed === true;

  state.additionalServicesReviewed = value.additionalServicesReviewed === true;
    state.pendingDetails = Array.isArray(value.pendingDetails)
    ? [
        ...new Set(
          value.pendingDetails
            .map((item) => cleanText(item, 150))
            .filter(Boolean),
        ),
      ].slice(0, 20)
    : [];
  const serviceIds = new Set(company.services.map((service) => service.id));
  if (serviceIds.has(value.serviceId)) state.serviceId = value.serviceId;
  const selectedService = company.services.find(
    (service) => service.id === state.serviceId,
  );
  if (
    selectedService?.options?.some(
      (option) => option.id === value.serviceOptionId,
    )
  ) {
    state.serviceOptionId = value.serviceOptionId;
  }
  state.requestedWork = cleanText(value.requestedWork);

  for (const field of ["brand", "model", "year", "engine", "fuel", "mileage"]) {
    state.vehicle[field] = cleanText(value.vehicle?.[field], 100);
  }

  state.vehicle.windshieldSensors =
    typeof value.vehicle?.windshieldSensors === "boolean"
      ? value.vehicle.windshieldSensors
      : null;
  for (const field of Object.keys(state.problem)) {
    state.problem[field] = cleanText(value.problem?.[field], 500);
  }
  for (const field of Object.keys(state.customer)) {
    state.customer[field] = cleanText(value.customer?.[field], 150);
  }
  state.customer.phone = normalizePhone(state.customer.phone);

  state.preferredTime = cleanText(value.preferredTime, 150);
  state.skipped = Array.isArray(value.skipped)
    ? [
        ...new Set(
          value.skipped.filter((field) => skippedFields.includes(field)),
        ),
      ]
    : [];

  return state;
}

export function hasValidContact(customer) {
  const email = String(customer?.email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    inspectPhone(customer?.phone).valid;
}

export function requiresParts(state, company) {
  if (!company)
    return (
      state.serviceId === "oil_filters" ||
      state.serviceId === "timing_service" ||
      state.serviceId === "clutch"
    );
  const service = company.services.find((item) => item.id === state.serviceId);
  const option = service?.options?.find(
    (item) => item.id === state.serviceOptionId,
  );
  return (
    option?.requiresParts === true ||
    service?.requiresParts === true ||
    (service?.options?.some((item) => item.requiresParts) && !option)
  );
}

export function missingIntakeFields(state, company) {
  if (state.intent !== "service_request") return [];

  const missing = [];
  if (
    !state.serviceOptionId &&
    !state.requestedWork &&
    !state.problem.description
  ) {
    missing.push("serviceOrProblem");
  }
  if (!state.vehicle.brand) missing.push("vehicle.brand");
  if (!state.vehicle.model) missing.push("vehicle.model");
  if (!state.vehicle.year && !state.skipped.includes("vehicle.year"))
    missing.push("vehicle.year");

    const oilEngineRequired = needsOilEngine(state);

  if (
    oilEngineRequired &&
    !state.vehicle.engine &&
    !state.skipped.includes("vehicle.engine")
  ) {
    missing.push("vehicle.engine");
  }

  if (!inspectAppointmentPreference(state.preferredTime).valid) missing.push("preferredTime");
  if (!state.customer.name) missing.push("customer.name");
  if (!hasValidContact(state.customer)) missing.push("customer.contact");
  if (
    state.serviceId === "oil_filters" &&
    (state.serviceOptionId === "engine_oil" || state.serviceOptionId === null) &&
    state.oilFilterScopeReviewed !== true
  ) missing.push("oilFilterScopeReviewed");

  if (
  requiresParts(state, company) &&
  hasUnspecifiedPartsSupply(state)
)
  missing.push("customerParts");
  return missing;
}

function matchesSchema(value, schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!types.includes(type) || (schema.enum && !schema.enum.includes(value)))
    return false;
  if (type === "string" && value.length > 20000) return false;
  if (type === "array")
    return (
      value.length <= 30 &&
      value.every((item) => matchesSchema(item, schema.items))
    );
  if (type === "object")
    return (
      Object.keys(value).every((key) =>
        Object.hasOwn(schema.properties, key),
      ) &&
      schema.required.every(
        (key) =>
          Object.hasOwn(value, key) &&
          matchesSchema(value[key], schema.properties[key]),
      )
    );
  return true;
}
export function validateModelResponse(value) {
  return (
    matchesSchema(value, intakeResponseSchema) && Boolean(value.reply.trim())
  );
}
