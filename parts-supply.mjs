export const partKeys = [
  "engineOil", "oilFilter", "airFilter", "cabinFilter", "fuelFilter", "lpgFilter",
];

export function emptyPartsOverrides() {
  return Object.fromEntries(partKeys.map((key) => [key, null]));
}

export function normalizePartsOverrides(
  value,
  base,
  selectedOperations = null,
) {
  const selected = selectedPartKeys({ selectedOperations });

  return Object.fromEntries(partKeys.map(key => {
    const choice = selected && !selected.includes(key)
      ? null
      : value?.[key];

    return [
      key,
      typeof choice === "boolean" && choice !== base ? choice : null,
    ];
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
  const oilSelected = Array.isArray(state.selectedOperations)
    ? state.selectedOperations.includes("oil_filters:engine_oil")
    : state.serviceId === "oil_filters" &&
      ["engine_oil", null].includes(state.serviceOptionId);

  return oilSelected &&
    ["engineOil", "oilFilter"].some(
      key => partSource(state, key) === false
    );
}

export function partsFingerprint(state) {
  const overrides = normalizePartsOverrides(
    state.partsOverrides,
    state.customerParts,
    state.selectedOperations,
  );

  return Object.values(overrides).some(
    value => typeof value === "boolean"
  )
    ? overrides
    : undefined;
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
  const selected = selectedPartKeys(state);

  const labels = partKeys.flatMap((key, index) => {
    if (selected && !selected.includes(key)) return [];

    const choice = overrides[key];

    return typeof choice === "boolean"
      ? [
          `${words.names[index]}: ${
            choice ? words.customer : words.service
          }`,
        ]
      : [];
  });

  if (
    !selected ||
    state.selectedOperations.some(id => !materialsFor(id)) ||
    selected.some(key => typeof overrides[key] !== "boolean")
  ) {
    labels.push(
      `${words.other}: ${
        state.customerParts === true
          ? words.customer
          : state.customerParts === false
            ? words.service
            : words.unknown
      }`
    );
  }

  return labels.join("; ");
}

const operationMaterials = {
  "oil_filters:engine_oil": ["engineOil", "oilFilter"],
  "oil_filters:air_filter": ["airFilter"],
  "oil_filters:cabin_filter": ["cabinFilter"],
  "oil_filters:fuel_filter": ["fuelFilter"],
  "oil_filters:lpg_filter": ["lpgFilter"],
};

const materialsFor = id =>
  Object.hasOwn(operationMaterials, id)
    ? operationMaterials[id]
    : null;

export function normalizeSelectedOperations(value, company) {
  if (!Array.isArray(value)) return null;

  const allowed = new Set(
    company.services.flatMap(service =>
      service.options?.length
        ? service.options.map(option => `${service.id}:${option.id}`)
        : [`${service.id}:`]
    )
  );

  return [
    ...new Set(
      value.slice(0, 30).map(id =>
        typeof id === "string" && allowed.has(id) ? id : "other"
      )
    ),
  ];
}

export function selectedPartKeys(state) {
  if (!Array.isArray(state.selectedOperations)) return null;

  return [
    ...new Set(
      state.selectedOperations.flatMap(id => materialsFor(id) ?? [])
    ),
  ];
}

export function operationRequiresParts(id, company) {
  if (typeof id !== "string" || id === "other") return true;
  if (materialsFor(id)) return true;

  const [serviceId, optionId] = id.split(":");
  const service = company?.services.find(item => item.id === serviceId);

  if (!service) {
    return ["timing_service", "clutch"].includes(serviceId);
  }

  const option = service.options?.find(item => item.id === optionId);

  return option?.requiresParts === true || service.requiresParts === true;
}

export function hasUnspecifiedPartsSupply(state, company) {
  if (
    !Array.isArray(state.selectedOperations) ||
    !state.selectedOperations.length
  ) {
    return typeof state.customerParts !== "boolean";
  }

  return state.selectedOperations.some(id => {
    const keys = materialsFor(id);

    if (keys) {
      return keys.some(key => partSource(state, key) === null);
    }

    return (
      operationRequiresParts(id, company) &&
      typeof state.customerParts !== "boolean"
    );
  });
}

export function operationsFingerprint(state) {
  return Array.isArray(state.selectedOperations)
    ? [...new Set(state.selectedOperations)].sort()
    : undefined;
}