import { getPriceQuote } from "./pricing.mjs";

export function resolveTireQuote(company, request = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { status: "invalid_input" };
  }

  const { optionId, quantity, rimDiameter, material } = request;

  const missing = [];
  for (const key of ["optionId", "quantity", "rimDiameter", "material"]) {
    if (request[key] === null || request[key] === undefined) {
      missing.push(key);
    }
  }

  if (missing.length) {
    return { status: "needs_details", missing };
  }

  if (
    !["seasonal_tires", "wheel_swap"].includes(optionId) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 4 ||
    !Number.isFinite(rimDiameter) ||
    rimDiameter <= 0 ||
    !["steel", "alu", "unknown"].includes(material)
  ) {
    return { status: "invalid_input" };
  }

  const quote = getPriceQuote(company, "tires", optionId);
  const quantityPrices = quote?.pricesByQuantityKc?.[quantity];

  if (!quantityPrices) {
    return { status: "unavailable" };
  }

  const materials =
    material === "unknown" ? ["steel", "alu"] : [material];

  const variants = [];

  for (const rimMaterial of materials) {
    const matchingKeys = Object.keys(quantityPrices).filter((key) => {
      const match = /^(steel|alu)_(\d+)_(\d+)$/.exec(key);

      return (
        match &&
        match[1] === rimMaterial &&
        rimDiameter >= Number(match[2]) &&
        rimDiameter <= Number(match[3])
      );
    });

    if (matchingKeys.length !== 1) {
      return { status: "unavailable", material: rimMaterial };
    }

    const variantId = matchingKeys[0];
    const priceKc = quantityPrices[variantId];

    if (!Number.isFinite(priceKc) || priceKc < 0) {
      return { status: "unavailable", material: rimMaterial };
    }

    variants.push({
      material: rimMaterial,
      variantId,
      priceKc,
    });
  }

  return {
    status: "ready",
    optionId,
    quantity,
    rimDiameter,
    variants,
  };
}

export function renderTireQuote(company, request, language = "cs") {
  if (request === null) return "";

  const words = {
    cs: [
      "Přezutí pneumatik",
      "Výměna kompletních kol",
      "Materiál ráfků",
      "Cena práce",
      "Plechové",
      "Hliníkové (ALU)",
      "Cenu pro tuto kombinaci upřesní servis.",
    ],
    sk: [
      "Prezutie pneumatík",
      "Výmena kompletných kolies",
      "Materiál diskov",
      "Cena práce",
      "Plechové",
      "Hliníkové (ALU)",
      "Cenu pre túto kombináciu upresní servis.",
    ],
    en: [
      "Tire fitting",
      "Complete wheel swap",
      "Rim material",
      "Labor price",
      "Steel",
      "Alloy",
      "The garage will confirm the price for this combination.",
    ],
    ru: [
      "Шиномонтаж",
      "Замена колёс в сборе",
      "Материал дисков",
      "Цена работы",
      "Стальные",
      "Легкосплавные (ALU)",
      "Стоимость для этого сочетания уточнит сервис.",
    ],
    uk: [
      "Шиномонтаж",
      "Заміна коліс у зборі",
      "Матеріал дисків",
      "Вартість роботи",
      "Сталеві",
      "Легкосплавні (ALU)",
      "Вартість для цього поєднання уточнить сервіс.",
    ],
    de: [
      "Reifenmontage",
      "Wechsel kompletter Räder",
      "Felgenmaterial",
      "Arbeitskosten",
      "Stahl",
      "Aluminium",
      "Die Werkstatt bestätigt den Preis für diese Kombination.",
    ],
  };

  const labels = words[language] ?? words.en;
  const result = resolveTireQuote(company, request);

  if (result.status !== "ready") return labels[6];

  const action =
    result.optionId === "seasonal_tires" ? labels[0] : labels[1];

  const number = new Intl.NumberFormat(
    Object.hasOwn(words, language) ? language : "en",
    { maximumFractionDigits: 2 },
  );

  const rows = result.variants.map((variant) => {
    const material = variant.material === "steel" ? labels[4] : labels[5];
    return `| ${material} | ${number.format(variant.priceKc)} Kč |`;
  });

  return [
    `${action} (${result.quantity} × ${number.format(result.rimDiameter)}″):`,
    "",
    `| ${labels[2]} | ${labels[3]} |`,
    "|---|---:|",
    ...rows,
  ].join("\n");
}