const optionIds = ["seasonal_tires", "wheel_swap"];
const fields = ["optionId", "quantity", "rimDiameter", "material"];

export function emptyTireDetails() {
  return {
    optionId: null,
    quantity: null,
    rimDiameter: null,
    material: "unanswered",
  };
}

export function normalizeTireDetails(value) {
  const result = emptyTireDetails();

  if (!value || typeof value !== "object") return result;

  if (optionIds.includes(value.optionId)) {
    result.optionId = value.optionId;
  }

  if (
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    value.quantity <= 4
  ) {
    result.quantity = value.quantity;
  }

  if (
    Number.isFinite(value.rimDiameter) &&
    value.rimDiameter > 0
  ) {
    result.rimDiameter = value.rimDiameter;
  }

  if (
    ["unanswered", "steel", "alu", "unknown"].includes(value.material)
  ) {
    result.material = value.material;
  }

  return result;
}

export function mergeTireDetails(previous, proposed, update) {
  const result = update?.reset === true
    ? emptyTireDetails()
    : normalizeTireDetails(previous);

  const next = normalizeTireDetails(proposed);

  for (const field of update?.fields ?? []) {
    if (fields.includes(field)) {
      result[field] = next[field];
    }
  }

  return result;
}

export function hasTireWork(state) {
  return optionIds.some(id =>
    state.selectedOperations?.includes(`tires:${id}`)
  );
}

export function missingTireDetails(state) {
  if (!hasTireWork(state)) return [];

  const tires = normalizeTireDetails(state.tires);
  const missing = [];

  if (
    !tires.optionId ||
    !state.selectedOperations.includes(`tires:${tires.optionId}`)
  ) {
    missing.push("tires.operation");
  }

  if (tires.quantity === null) {
    missing.push("tires.quantity");
  }

  if (tires.rimDiameter === null) {
    missing.push("tires.rimDiameter");
  }

  if (tires.material === "unanswered") {
    missing.push("tires.rimMaterial");
  }

  return missing;
}

export function tireQuoteRequest(state) {
  if (!hasTireWork(state) || missingTireDetails(state).length) {
    return null;
  }

  return normalizeTireDetails(state.tires);
}