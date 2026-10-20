import { operationPartsSource } from "./parts-supply.mjs";

// Service IDs match company.json. All amounts include DPH.
export const pricingCatalog = {
  diagnostics: { method: "fixed", priceKc: 700 },
  "scheduled_maintenance:annual_service": { method: "labor", minutesFrom: 60 },
  "oil_filters:engine_oil": { method: "labor", minutesFrom: 30, materials: "olej a olejový filtr" },
  "oil_filters:air_filter": {
  method: "labor",
  minutesFrom: 20,
  materials: "vzduchový filtr motoru"
},
"oil_filters:cabin_filter": {
  method: "labor",
  minutesFrom: 20,
  materials: "kabinový (pylový) filtr"
},
    "oil_filters:fuel_filter": {
    method: "labor",
    minutesFrom: 30,
    materials: "palivový filtr"
  },
  "oil_filters:lpg_filter": {
    method: "labor",
    minutesFrom: 30,
    materials: "jeden LPG filtr podle typu systému"
  },
  "brakes:brake_inspection": { method: "labor", minutesFrom: 30 },
  "brakes:brake_pads": { method: "labor", minutesFrom: 45, materials: "brzdové destičky" },
  "brakes:brake_discs": { method: "labor", minutesFrom: 60, materials: "brzdové kotouče" },
  "brakes:brake_discs_pads": { method: "labor", minutesFrom: 90, materials: "brzdové kotouče a destičky" },
  "brakes:brake_fluid": { method: "labor", minutesFrom: 30, materials: "brzdová kapalina" },
   "tires:seasonal_tires": {
    method: "fixed_variants",
    variantsKc: {
      steel_13_16: 1450,
      steel_17_18: 1600,
      steel_19_22: 2000,
      steel_23_24: 2300,
      alu_13_14: 1450,
      alu_15_18: 1600,
      alu_19_22: 2000,
      alu_23_24: 2300,
    },
    variantLabels: {
      steel_13_16: "plech 13–16″",
      steel_17_18: "plech 17–18″",
      steel_19_22: "plech 19–22″",
      steel_23_24: "plech 23–24″",
      alu_13_14: "ALU 13–14″",
      alu_15_18: "ALU 15–18″",
      alu_19_22: "ALU 19–22″",
      alu_23_24: "ALU 23–24″",
    },
  },

  "tires:wheel_swap": {
    method: "fixed_variants",
    variantsKc: {
      steel_13_16: 1000,
      steel_17_20: 1200,
      steel_21_24: 1600,
      alu_13_16: 1000,
      alu_17_20: 1200,
      alu_21_24: 1600,
    },
    variantLabels: {
      steel_13_16: "plech 13–16″",
      steel_17_20: "plech 17–20″",
      steel_21_24: "plech 21–24″",
      alu_13_16: "ALU 13–16″",
      alu_17_20: "ALU 17–20″",
      alu_21_24: "ALU 21–24″",
    },
  },
  "tires:tread_check": { method: "fixed", priceKc: 250 },
  "chassis:chassis_inspection": { method: "labor", minutesFrom: 45 },
  "air_conditioning:refrigerant": {
    method: "service_fee_variants",
    variantsKc: { R134a: 750, R1234yf: 1200 },
    variantLabels: { R134a: "R134a", R1234yf: "R1234yf" },
    materials: "skutečně doplněné chladivo"
  },
  "air_conditioning:ac_disinfection": { method: "labor", minutesFrom: 30, materials: "dezinfekční prostředek" },
  "auto_glass:glass_crack": { method: "labor", minutesFrom: 45, materials: "materiál k opravě" },
  "auto_glass:windshield": {
    method: "labor",
    minutesFrom: 90,
    materials: "čelní sklo a případný další materiál podle vozu a výbavy"
  },
  "stk:stk_preparation": { method: "labor", minutesFrom: 45 },
  "stk:stk_arrangement": {
    method: "fixed_variants",
    variantsKc: { inspection_only: 2450, inspection_and_emissions: 3450 },
    variantLabels: { inspection_only: "bez emisí", inspection_and_emissions: "s emisemi" }
  },
  timing_service: {
    method: "labor", minutesFrom: 240,
    materials: "díly rozvodů podle konkrétního vozu"
  },
  clutch: { method: "labor", minutesFrom: 240, materials: "spojková sada" },
  wheel_alignment: {
    method: "fixed_variants",
    variantsKc: { front_axle: 1000, both_axles: 1200 },
    variantLabels: { front_axle: "přední náprava", both_axles: "obě nápravy" }
  }
};

export function getPriceQuote(
  company,
  serviceId,
  optionId = null,
  hourlyRateKc = company.laborRates?.standardKcPerHour
) {
  const service = company.services.find((item) => item.id === serviceId);
  const operation = optionId ? service?.options?.find((item) => item.id === optionId) : service;
  if (!operation) return null;
  const key = optionId ? `${serviceId}:${optionId}` : serviceId;
  const rule = pricingCatalog[key];
  if (!rule) return null;

  if (rule.method === "labor") {
    const amount = hourlyRateKc * rule.minutesFrom / 60;
    if (!Number.isFinite(amount) || amount < 0) return null;
    return {
      kind: "labor_only",
      priceFromKc: Math.floor(amount / 100) * 100,
      materials: rule.materials ?? null
    };
  }

  if (
    serviceId === "tires" &&
    ["seasonal_tires", "wheel_swap"].includes(optionId) &&
    rule.method === "fixed_variants"
  ) {
    const pricesByQuantityKc = Object.fromEntries(
      [1, 2, 3, 4].map((quantity) => [
        quantity,
        Object.fromEntries(
          Object.entries(rule.variantsKc).map(([variant, priceForFour]) => [
            variant,
            (priceForFour / 4) * quantity,
          ]),
        ),
      ]),
    );

    return {
      kind: "fixed_variants",
      variantsKc: rule.variantsKc,
      variantLabels: rule.variantLabels ?? null,
      baseQuantity: 4,
      pricesByQuantityKc,
      materials: rule.materials ?? null,
    };
  }

  if (rule.method === "fixed") return { kind: "fixed", priceKc: rule.priceKc };
  if (rule.method === "fixed_variants" || rule.method === "service_fee_variants") {
    return {
      kind: rule.method,
      variantsKc: rule.variantsKc,
      variantLabels: rule.variantLabels ?? null,
      materials: rule.materials ?? null
    };
  }
  return null;
}

export function getPriceBook(
  company,
  hourlyRateKc = company.laborRates?.standardKcPerHour
) {
  return Object.fromEntries(
    company.services.flatMap((service) => [
      [
        service.id,
        getPriceQuote(company, service.id, null, hourlyRateKc)
      ],
      ...(service.options ?? []).map((option) => [
        `${service.id}:${option.id}`,
        getPriceQuote(company, service.id, option.id, hourlyRateKc)
      ])
    ]).filter(([, quote]) => quote !== null)
  );
}

export function withPublicPrices(company) {
  function decorate(serviceId, optionId, item) {
    const quote = getPriceQuote(company, serviceId, optionId);
    if (!quote) return { ...item, priceLabel: null };
    if (quote.kind === "labor_only") {
      return { ...item, priceLabel: `práce od ${quote.priceFromKc.toLocaleString("cs-CZ")} Kč; materiál zvlášť` };
    }
    if (quote.kind === "fixed") return { ...item, priceLabel: `${quote.priceKc.toLocaleString("cs-CZ")} Kč` };
    if (quote.kind === "fixed_variants") {
      const label = Object.entries(quote.variantsKc).map(([key, amount]) =>
        `${quote.variantLabels?.[key] ?? key}: ${amount.toLocaleString("cs-CZ")} Kč`
      ).join("; ");
      return { ...item, priceLabel: label };
    }
    const fees = Object.entries(quote.variantsKc).map(([key, amount]) =>
      `${quote.variantLabels?.[key] ?? key}: ${amount.toLocaleString("cs-CZ")} Kč`
    ).join("; ");
    return { ...item, priceLabel: `servisní poplatek ${fees}; chladivo zvlášť` };
  }
  return {
    ...company,
    services: company.services.map((service) => ({
      ...decorate(service.id, null, service),
      options: (service.options ?? []).map((option) => decorate(service.id, option.id, option))
    }))
  };
}
export function getPartsPriceBook(company, state) {
  return Object.fromEntries(
    ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"].map((id) => {
      const own = operationPartsSource(state, id);
      return ["oil_filters:" + id, {
        customerParts: own,
        quote: own === null ? null : getPriceQuote(
          company,
          "oil_filters",
          id,
          own
            ? company.laborRates.customerPartsKcPerHour
            : company.laborRates.standardKcPerHour,
        ),
      }];
    }),
  );
}
