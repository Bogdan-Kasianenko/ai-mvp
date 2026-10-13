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
  customerParts: { type: ["boolean", "null"] },
  additionalServicesReviewed: { type: "boolean" },
  serviceId: nullableText,
  serviceOptionId: nullableText,
  requestedWork: nullableText,
  vehicle: objectSchema({
    brand: nullableText,
    model: nullableText,
    year: nullableText,
    engine: nullableText,
    mileage: nullableText,
    windshieldSensors: { type: ["boolean", "null"] }
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
  needsClarification: { type: "boolean" },
  intake: intakeSchema,
  submissionAction: {
  type: "string",
  enum: ["none", "confirm_send", "decline_send", "ask_status"]
}
});

export function emptyIntakeState() {
  return {
    intent: "general",
    customerParts: null,
    additionalServicesReviewed: false,
    serviceId: null,
    serviceOptionId: null,
    requestedWork: null,
    vehicle: {
  brand: null,
  model: null,
  year: null,
  engine: null,
  mileage: null,
  windshieldSensors: null
},
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
  if (typeof value.customerParts === "boolean") {
    state.customerParts = value.customerParts;
  }
  
  state.additionalServicesReviewed =
  value.additionalServicesReviewed === true;
  const serviceIds = new Set(company.services.map((service) => service.id));
  if (serviceIds.has(value.serviceId)) state.serviceId = value.serviceId;
  const selectedService = company.services.find((service) => service.id === state.serviceId);
  if (selectedService?.options?.some((option) => option.id === value.serviceOptionId)) {
    state.serviceOptionId = value.serviceOptionId;
  }
  state.requestedWork = cleanText(value.requestedWork);

  for (const field of ["brand", "model", "year", "engine", "mileage"]) {
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
  state.preferredTime = cleanText(value.preferredTime, 150);
  state.skipped = Array.isArray(value.skipped)
    ? [...new Set(value.skipped.filter((field) => skippedFields.includes(field)))]
    : [];

  return state;
}

export function hasValidContact(customer) {
  const email = String(customer?.email ?? "").trim();
  const phone = String(customer?.phone ?? "").replace(/[\s().-]/g, "");

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /^\+?\d{9,15}$/.test(phone);
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
  if (!hasValidContact(state.customer)) missing.push("customer.contact");

  return missing.filter((field) => !state.skipped.includes(field));
}
