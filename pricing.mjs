// Ключ: serviceId или serviceId:serviceOptionId из company.json.
// Здесь нет второго списка названий услуг.
export const pricingCatalog = {
  "oil_filters:engine_oil": {
    method: "hourly",
    laborMinutes: { min: 30, typical: 40, max: 45 },
    partsByClass: {
      A: { from: 750, to: 1400 },   // масло + масляный фильтр
      B: { from: 1150, to: 2300 },
      C: { from: 1900, to: 4400 }
    }
  },
  "brakes:brake_pads": {
    method: "hourly",
    laborMinutes: { min: 45, typical: 50, max: 60 },
    partsByClass: {
      A: { from: 600, to: 1200 },
      B: { from: 1000, to: 2200 },
      C: { from: 2000, to: 4500 }
    }
  },
  "brakes:brake_discs": {
    method: "hourly",
    laborMinutes: null,
    partsByClass: {
      A: { from: 1200, to: 2500 },
      B: { from: 2200, to: 4500 },
      C: { from: 4500, to: null }
    }
  },
  "brakes:brake_discs_pads": {
    method: "hourly",
    laborMinutes: { min: 90, typical: 105, max: 120 },
    partsByClass: {
      A: { from: 1800, to: 3700 },
      B: { from: 3200, to: 6700 },
      C: { from: 6500, to: null }
    }
  },
  "brakes:brake_fluid": {
  method: "hourly",
  laborMinutes: { min: 30, typical: 60, max: 90 },
  estimatedFluidLitersByClass: {
    A: { from: 0.5, to: 1.0 },
    B: { from: 0.7, to: 1.3 },
    C: { from: 0.8, to: 1.5 }
  },
  estimatedFluidPricePerLiterKc: 400,
  partsByClass: {
    A: { from: 200, to: 400 },
    B: { from: 280, to: 520 },
    C: { from: 320, to: 600 }
  }
},
  "air_conditioning:refrigerant": {
  method: "refrigerant",
  tariffsByType: {
    R134a: { basePriceKc: 750, pricePerGramKc: 2.5 },
    R1234yf: { basePriceKc: 1200, pricePerGramKc: 6 }
  }
},
  "tires:seasonal_tires": {
  method: "fixed",
  fixedPricesKc: {
    steel_13_16: 1450,
    alu_13_14: 1450,
    alu_15_18: 1600,
    alu_19_22: 2000,
    alu_23_24: 2300
  }
},
"tires:wheel_swap": {
  method: "fixed",
  fixedPricesKc: {
    steel_13_16: 1000,
    alu_13_16: 1000,
    alu_17_20: 1200,
    alu_21_24: 1600
  }
},
  timing_belt: {
    method: "hourly",
    laborMinutes: { min: 240, typical: 360, max: 480 },
    partsByClass: {
      A: { from: 2000, to: 4500 },
      B: { from: 3500, to: 7000 },
      C: { from: 6000, to: 14000 }
    }
  },
  clutch: {
    method: "hourly",
    laborMinutes: { min: 240, typical: 360, max: 480 },
    partsByClass: {
      A: { from: 3000, to: 6000 },
      B: { from: 8000, to: 16000 },
      C: { from: 15000, to: null }
    }
  },
  wheel_alignment: {
  method: "fixed",
  fixedPriceKc: 1000, // цена «от» за переднюю ось
  fixedPricesKc: {
    front_axle: 1000,
    both_axles: 1200
  }
}
};

function validRange(value) {
  return (
    value &&
    Number.isFinite(value.from) &&
    value.from >= 0 &&
    (value.to === null ||
      (Number.isFinite(value.to) && value.to >= value.from))
  );
}

export function calculateServiceEstimate(
  company,
  serviceId,
  optionId,
  vehicleClass,
  hourlyRateKc = 850, 
  details = {}
) {   
    details ??= {};
  const service = company.services.find((item) => item.id === serviceId);
  const operation = optionId
    ? service?.options?.find((item) => item.id === optionId)
    : service;

  if (!operation) return null;

  const key = optionId ? `${serviceId}:${optionId}` : serviceId;
  const pricing = pricingCatalog[key];
  if (!pricing) return null;
  if (pricing.method === "refrigerant") {
   const tariffs = pricing.tariffsByType;
  const type = details.refrigerantType;

  if (typeof type !== "string" || !tariffs || !Object.hasOwn(tariffs, type)) {
    return null;
  }

  const tariff = tariffs[type];
  if (
    !Number.isFinite(tariff?.basePriceKc) ||
    tariff.basePriceKc < 0 ||
    !Number.isFinite(tariff.pricePerGramKc) ||
    tariff.pricePerGramKc < 0
  ) {
    return null;
  }

  const work = {
    from: tariff.basePriceKc,
    to: tariff.basePriceKc
  };

  const grams = details.gramsAdded;
  if (!Number.isFinite(grams) || grams < 0) {
    return { work, materials: null, total: null };
  }

  const refrigerantCost = Math.round(grams * tariff.pricePerGramKc);
  const total = tariff.basePriceKc + refrigerantCost;

    if (!Number.isFinite(refrigerantCost) || !Number.isFinite(total)) {
    return { work, materials: null, total: null };
  }

  return {
    work,
    materials: { from: refrigerantCost, to: refrigerantCost },
    total: { from: total, to: total }
  };
}

  let work = null;

  if (pricing.method === "fixed") {
  const variants = pricing.fixedPricesKc;

  if (variants) {
    const prices = Object.values(variants).filter(
      (price) => Number.isFinite(price) && price >= 0
    );

    if (details.variant !== undefined) {
      if (!Object.hasOwn(variants, details.variant)) return null;
      const price = variants[details.variant];
      if (!Number.isFinite(price)) return null;
      work = { from: price, to: price };
    } else if (prices.length > 0) {
      work = {
        from: Math.min(...prices),
        to: Math.max(...prices)
      };
    }
  }

  if (!work && Number.isFinite(pricing.fixedPriceKc)) {
    work = {
      from: pricing.fixedPriceKc,
      to: pricing.fixedPriceKc
    };
  }

  } else if (
    pricing.method === "hourly" &&
    Number.isFinite(hourlyRateKc) &&
    hourlyRateKc > 0 &&
    Number.isFinite(pricing.laborMinutes?.min) &&
    Number.isFinite(pricing.laborMinutes?.max)
  ) {
    work = {
      from: Math.round(pricing.laborMinutes.min / 60 * hourlyRateKc),
      to: Math.round(pricing.laborMinutes.max / 60 * hourlyRateKc)
    };
  }

  if (work && (!Number.isFinite(work.from) || !Number.isFinite(work.to))) {
    work = null;
  }

  const candidate = pricing.partsByClass?.[vehicleClass];
  const materials = operation.requiresParts
    ? (validRange(candidate) ? candidate : null)
    : { from: 0, to: 0 };

    const total = work && materials
    ? {
        from: work.from + materials.from,
        to: work.to === null || materials.to === null
          ? null
          : work.to + materials.to
      }
    : null;

  return {
    work,
    materials,
    total:
      total &&
      Number.isFinite(total.from) &&
      (total.to === null || Number.isFinite(total.to))
        ? total
        : null
  };
}

export function findUnknownPricingIds(company) {
  const offeredIds = new Set(
    company.services.flatMap((service) => [
      service.id,
      ...(service.options || []).map(
        (option) => `${service.id}:${option.id}`
      )
    ])
  );

  return Object.keys(pricingCatalog).filter(
    (id) => !offeredIds.has(id)
  );
}