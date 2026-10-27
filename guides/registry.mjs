import { noStartGuide } from "./no-start.mjs";
import { jerkingGuide } from "./jerking.mjs";

export const guideRegistry = Object.freeze({
    jerkingDuringAcceleration: Object.freeze({
    ...jerkingGuide,
    description:
      "Cukání nebo škubání vozidla při zrychlování, přidávání plynu či rozjezdu.",
    serviceIds: Object.freeze([]),
  }),
  noStart: Object.freeze({
    ...noStartGuide,
    description:
      "Vozidlo nejde nastartovat nebo uvést do stavu připraveného k jízdě.",
    serviceIds: Object.freeze([]),
  }),
});

export function normalizeGuideIds(value, registry = guideRegistry) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter(
    id => typeof id === "string" && Object.hasOwn(registry, id),
  ))].sort();
}

export function readActiveGuideIds(state = {}, registry = guideRegistry) {
  if (Array.isArray(state.activeGuides)) {
    return normalizeGuideIds(state.activeGuides, registry);
  }

  return normalizeGuideIds([state.activeGuide], registry);
}

export function requiredGuideIds(operations, registry = guideRegistry) {
  const services = new Set(
    (Array.isArray(operations) ? operations : [])
      .filter(operation => typeof operation === "string")
      .map(operation => operation.split(":")[0]),
  );

  return normalizeGuideIds(
    Object.entries(registry)
      .filter(([, guide]) =>
        guide.serviceIds?.some(id => services.has(id)))
      .map(([id]) => id),
    registry,
  );
}
