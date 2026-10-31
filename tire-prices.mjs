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
      "Úkon",
      "Cena práce",
      "Plechové",
      "Hliníkové",
      "Cenu pro tuto kombinaci upřesní servis.",
    ],
    sk: [
      "Prezutie pneumatík",
      "Výmena kompletných kolies",
      "Úkon",
      "Cena práce",
      "Plechové",
      "Hliníkové",
      "Cenu pre túto kombináciu upresní servis.",
    ],
    en: [
      "Tire fitting",
      "Complete wheel swap",
      "Service",
      "Labor price",
      "Steel",
      "Alloy",
      "The garage will confirm the price for this combination.",
    ],
    ru: [
      "Шиномонтаж",
      "Замена колёс в сборе",
      "Услуга",
      "Цена работы",
      "Стальные",
      "Легкосплавные",
      "Стоимость для этого сочетания уточнит сервис.",
    ],
    uk: [
      "Шиномонтаж",
      "Заміна коліс у зборі",
      "Послуга",
      "Вартість роботи",
      "Сталеві",
      "Легкосплавні",
      "Вартість для цього поєднання уточнить сервіс.",
    ],
    de: [
      "Reifenmontage",
      "Wechsel kompletter Räder",
      "Leistung",
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

  const rimPhrases = {
    cs: { steel: "na plechových ráfcích", alu: "na hliníkových ráfcích" },
    sk: { steel: "na plechových diskoch", alu: "na hliníkových diskoch" },
    en: { steel: "on steel rims", alu: "on alloy rims" },
    ru: { steel: "на стальных дисках", alu: "на легкосплавных дисках" },
    uk: { steel: "на сталевих дисках", alu: "на легкосплавних дисках" },
    de: { steel: "auf Stahlfelgen", alu: "auf Aluminiumfelgen" },
  };
  const wheelPhrases = {
    cs: { steel: "s plechovými ráfky", alu: "s hliníkovými ráfky" },
    sk: { steel: "s plechovými diskami", alu: "s hliníkovými diskami" },
    en: { steel: "with steel rims", alu: "with alloy rims" },
    ru: { steel: "со стальными дисками", alu: "с легкосплавными дисками" },
    uk: { steel: "зі сталевими дисками", alu: "з легкосплавними дисками" },
    de: { steel: "mit Stahlfelgen", alu: "mit Aluminiumfelgen" },
  };

  const number = new Intl.NumberFormat(
    Object.hasOwn(words, language) ? language : "en",
    { maximumFractionDigits: 2 },
  );

  const rows = result.variants.map((variant) => {
    const phrases = result.optionId === "seasonal_tires"
      ? rimPhrases : wheelPhrases;
    const work = `${action} ${(phrases[language] ?? phrases.en)[variant.material]} ` +
      `(${result.quantity} × ${number.format(result.rimDiameter)}″)`;
    return `| ${work} | ${number.format(variant.priceKc)} Kč |`;
  });

  return [
    `| ${labels[2]} | ${labels[3]} |`,
    "|---|---:|",
    ...rows,
  ].join("\n");
}
