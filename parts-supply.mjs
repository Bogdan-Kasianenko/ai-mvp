export const partKeys = [
  "engineOil", "oilFilter", "airFilter", "cabinFilter", "fuelFilter", "lpgFilter",
];

export function emptyPartsOverrides() {
  return Object.fromEntries(partKeys.map((key) => [key, null]));
}

export function normalizePartsOverrides(value, base) {
  return Object.fromEntries(partKeys.map((key) => {
    const choice = value?.[key];
    return [key, typeof choice === "boolean" && choice !== base ? choice : null];
  }));
}

export function partSource(state, key) {
  const choice = state.partsOverrides?.[key];
  return typeof choice === "boolean" ? choice :
    typeof state.customerParts === "boolean" ? state.customerParts : null;
}

export function operationPartsSource(state, optionId) {
  const keys = {
    engine_oil: ["engineOil", "oilFilter"],
    air_filter: ["airFilter"], cabin_filter: ["cabinFilter"],
    fuel_filter: ["fuelFilter"], lpg_filter: ["lpgFilter"],
  }[optionId];
  if (!keys) return state.customerParts ?? null;
  const choices = keys.map((key) => partSource(state, key));
  if (choices.includes(true)) return true;
  return choices.every((choice) => choice === false) ? false : null;
}

export function needsOilEngine(state) {
  return state.serviceId === "oil_filters" &&
    ["engine_oil", null].includes(state.serviceOptionId) &&
    ["engineOil", "oilFilter"].some((key) => partSource(state, key) === false);
}

export function partsFingerprint(state) {
  const overrides = normalizePartsOverrides(state.partsOverrides, state.customerParts);
  return Object.values(overrides).some((value) => typeof value === "boolean")
    ? overrides : undefined;
}

const wording = {
  cs: { names: ["olej", "olejový filtr", "vzduchový filtr", "kabinový filtr", "palivový filtr", "LPG filtr"], customer: "dodá zákazník", service: "zajistí servis", other: "ostatní vybrané díly", unknown: "dodání není upřesněno" },
  sk: { names: ["olej", "olejový filter", "vzduchový filter", "kabínový filter", "palivový filter", "LPG filter"], customer: "dodá zákazník", service: "zabezpečí servis", other: "ostatné vybrané diely", unknown: "dodanie nie je upresnené" },
  en: { names: ["oil", "oil filter", "air filter", "cabin filter", "fuel filter", "LPG filter"], customer: "supplied by customer", service: "supplied by garage", other: "other selected parts", unknown: "supplier not specified" },
  ru: { names: ["масло", "масляный фильтр", "воздушный фильтр", "салонный фильтр", "топливный фильтр", "LPG-фильтр"], customer: "предоставит клиент", service: "обеспечит сервис", other: "остальные выбранные детали", unknown: "поставщик не уточнён" },
  uk: { names: ["олива", "оливний фільтр", "повітряний фільтр", "салонний фільтр", "паливний фільтр", "LPG-фільтр"], customer: "надасть клієнт", service: "забезпечить сервіс", other: "інші вибрані деталі", unknown: "постачальника не уточнено" },
  de: { names: ["Öl", "Ölfilter", "Luftfilter", "Innenraumfilter", "Kraftstofffilter", "LPG-Filter"], customer: "vom Kunden gestellt", service: "von der Werkstatt gestellt", other: "übrige ausgewählte Teile", unknown: "Lieferant nicht angegeben" },
};

export function describeParts(state, language, fallback) {
  const overrides = partsFingerprint(state);
  if (!overrides) return fallback;
  const words = wording[language] ?? wording.en;
  const selected = state.customerParts == null ? selectedPartKeys(state) : null;
  const labels = partKeys.flatMap((key, index) => {
    if (selected && !selected.includes(key)) return [];
    const choice = overrides[key];
    return typeof choice === "boolean"
      ? [`${words.names[index]}: ${choice ? words.customer : words.service}`] : [];
  });
  if (!selected || selected.some(key => partSource(state, key) === null))
    labels.push(`${words.other}: ${
    state.customerParts === true ? words.customer :
      state.customerParts === false ? words.service : words.unknown
  }`);
  return labels.join("; ");
}

// Resolve only a recognizable oil/filter scope. Unknown additional work keeps
// the general supplier question mandatory instead of guessing its materials.
export function selectedPartKeys(state) {
  if (state.serviceId !== "oil_filters") return null;
  const byOption = {
    engine_oil: ["engineOil", "oilFilter"],
    air_filter: ["airFilter"], cabin_filter: ["cabinFilter"],
    fuel_filter: ["fuelFilter"], lpg_filter: ["lpgFilter"],
  };
  const required = new Set(byOption[state.serviceOptionId] ?? []);
  const text = String(state.requestedWork ?? "").normalize("NFD")
    .replace(/\p{M}/gu, "").toLowerCase();
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const knownWord = /^(?:vymen\p{L}*|motor\p{L}*|olej\p{L}*|filtr\p{L}*|vzduch\p{L}*|kabin\p{L}*|pyl\p{L}*|paliv\p{L}*|lpg|vsech\p{L}*|vsetk\p{L}*|a|i|s|se|za|pro|the|and|with|of|engine|oil|filter|filters|air|cabin|pollen|fuel|replacement|replace|change|all|замен\p{L}*|мотор\p{L}*|масл\p{L}*|фильтр\p{L}*|воздуш\p{L}*|салон\p{L}*|топлив\p{L}*|всех|все|и|заміна|заміни|олив\p{L}*|фільтр\p{L}*|повітр\p{L}*|палив\p{L}*|усіх|всіх|та|luft\p{L}*|innenraum\p{L}*|kraftstoff\p{L}*|ol\p{L}*|wechsel|austausch|und|des|der|alle\p{L}*)$/u;
  if (words.some(word => !knownWord.test(word))) return null;
  if (/olej|\boil\b|масл|олив|\bol\p{L}*/u.test(text)) {
    required.add("engineOil"); required.add("oilFilter");
  }
  if (/vzduch|\bair\b|воздуш|повітр|luft/u.test(text)) required.add("airFilter");
  if (/kabin|pyl|\bcabin\b|pollen|салон|innenraum/u.test(text)) required.add("cabinFilter");
  if (/paliv|\bfuel\b|топлив|палив|kraftstoff/u.test(text)) required.add("fuelFilter");
  if (/\blpg\b/u.test(text)) required.add("lpgFilter");
  if (/vsech|vsetk|\ball\b|всех|все|усіх|всіх|\balle\p{L}*/u.test(text)) {
    required.add("engineOil"); required.add("oilFilter");
    required.add("airFilter"); required.add("cabinFilter");
  }
  return required.size ? [...required] : null;
}

export function hasUnspecifiedPartsSupply(state) {
  const keys = selectedPartKeys(state);
  return keys
    ? keys.some(key => partSource(state, key) === null)
    : typeof state.customerParts !== "boolean";
}
