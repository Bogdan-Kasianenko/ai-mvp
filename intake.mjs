const nullableText = { type: ["string", "null"] };

function objectSchema(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
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
  "preferredTime"
];

const intakeSchema = objectSchema({
  intent: { type: "string", enum: ["general", "service_discussion", "service_request"] },
  serviceId: nullableText,
  serviceOptionId: nullableText,
  requestedWork: nullableText,
  vehicle: objectSchema({
    brand: nullableText,
    model: nullableText,
    year: nullableText,
    engine: nullableText,
    mileage: nullableText
  }),
  problem: objectSchema({
    description: nullableText,
    when: nullableText,
    warningLights: nullableText,
    otherSymptoms: nullableText,
    lastOilChange: nullableText
  }),
  customer: objectSchema({
    name: nullableText,
    phone: nullableText,
    email: nullableText
  }),
  preferredTime: nullableText,
  skipped: { type: "array", items: { type: "string", enum: skippedFields } }
});

export const intakeResponseSchema = objectSchema({
  reply: { type: "string" },
  intake: intakeSchema
});

export function emptyIntakeState() {
  return {
    intent: "general",
    serviceId: null,
    serviceOptionId: null,
    requestedWork: null,
    vehicle: { brand: null, model: null, year: null, engine: null, mileage: null },
    problem: {
      description: null,
      when: null,
      warningLights: null,
      otherSymptoms: null,
      lastOilChange: null
    },
    customer: { name: null, phone: null, email: null },
    preferredTime: null,
    skipped: []
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

  if (["general", "service_discussion", "service_request"].includes(value.intent)) {
    state.intent = value.intent;
  }

  const serviceIds = new Set(company.services.map((service) => service.id));
  if (serviceIds.has(value.serviceId)) state.serviceId = value.serviceId;
  const selectedService = company.services.find((service) => service.id === state.serviceId);
  if (selectedService?.options?.some((option) => option.id === value.serviceOptionId)) {
    state.serviceOptionId = value.serviceOptionId;
  }
  state.requestedWork = cleanText(value.requestedWork);

  for (const field of Object.keys(state.vehicle)) {
    state.vehicle[field] = cleanText(value.vehicle?.[field], 100);
  }
  for (const field of Object.keys(state.problem)) {
    state.problem[field] = cleanText(value.problem?.[field], 500);
  }
  for (const field of Object.keys(state.customer)) {
    state.customer[field] = cleanText(value.customer?.[field], 150);
  }
  state.preferredTime = cleanText(value.preferredTime, 150);
  state.skipped = Array.isArray(value.skipped)
    ? [...new Set(value.skipped.filter((field) => skippedFields.includes(field)))]
    : [];

  return state;
}

export function missingIntakeFields(state) {
  if (state.intent !== "service_request") return [];

  const missing = [];
  if (!state.serviceOptionId && !state.requestedWork && !state.problem.description) {
    missing.push("serviceOrProblem");
  }
  if (!state.vehicle.brand) missing.push("vehicle.brand");
  if (!state.vehicle.model) missing.push("vehicle.model");
  if (!state.vehicle.year) missing.push("vehicle.year");
  if (!state.preferredTime) missing.push("preferredTime");
  if (!state.customer.name) missing.push("customer.name");
  if (!state.customer.phone && !state.customer.email) missing.push("customer.contact");

  return missing.filter((field) => !state.skipped.includes(field));
}
