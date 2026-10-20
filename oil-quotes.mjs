import { getPriceQuote } from "./pricing.mjs";
import { operationPartsSource, partSource } from "./parts-supply.mjs";

export const oilOptionIds = ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"];
const translations = {
  cs: { names: ["Výměna motorového oleje a olejového filtru", "Výměna vzduchového filtru", "Výměna kabinového filtru", "Výměna palivového filtru", "Výměna jednoho LPG filtru"], intro: "Tady máte přehled počátečních cen za práci:", headers: ["Úkon", "Cena práce od", "Díly servisu — práce od", "Vlastní díly — práce od"], note: "Částky jsou pouze za práci. Cenu materiálu dodaného servisem servis upřesní podle konkrétního auta a výběru dílů." },
  sk: { names: ["Výmena motorového oleja a olejového filtra", "Výmena vzduchového filtra", "Výmena kabínového filtra", "Výmena palivového filtra", "Výmena jedného LPG filtra"], intro: "Tu je prehľad počiatočných cien práce:", headers: ["Úkon", "Cena práce od", "Diely servisu — práca od", "Vlastné diely — práca od"], note: "Sumy sú iba za prácu. Cenu materiálu dodaného servisom servis upresní podľa konkrétneho auta a výberu dielov." },
  en: { names: ["Engine oil and oil filter replacement", "Air filter replacement", "Cabin filter replacement", "Fuel filter replacement", "Replacement of one LPG filter"], intro: "Here are the starting labor prices:", headers: ["Operation", "Labor from", "Garage parts — labor from", "Customer parts — labor from"], note: "These amounts cover labor only. The garage will quote its supplied materials based on the vehicle and selected parts." },
  ru: { names: ["Замена моторного масла и масляного фильтра", "Замена воздушного фильтра", "Замена салонного фильтра", "Замена топливного фильтра", "Замена одного LPG-фильтра"], intro: "Начальные цены за работу:", headers: ["Услуга", "Работа от", "Детали сервиса — работа от", "Детали клиента — работа от"], note: "Указана только работа. Стоимость материалов сервиса уточняется по автомобилю и выбранным деталям." },
  uk: { names: ["Заміна моторної оливи та оливного фільтра", "Заміна повітряного фільтра", "Заміна салонного фільтра", "Заміна паливного фільтра", "Заміна одного LPG-фільтра"], intro: "Початкові ціни за роботу:", headers: ["Послуга", "Робота від", "Деталі сервісу — робота від", "Деталі клієнта — робота від"], note: "Зазначено лише роботу. Вартість матеріалів сервісу уточнюється за автомобілем і вибраними деталями." },
  de: { names: ["Motoröl- und Ölfilterwechsel", "Luftfilterwechsel", "Innenraumfilterwechsel", "Kraftstofffilterwechsel", "Wechsel eines LPG-Filters"], intro: "Die Arbeitskosten beginnen bei:", headers: ["Leistung", "Arbeit ab", "Werkstattteile — Arbeit ab", "Eigene Teile — Arbeit ab"], note: "Die Beträge gelten nur für Arbeit. Die Werkstatt nennt Materialpreise passend zum Fahrzeug und den gewählten Teilen." },
};

export function renderOilQuotes(company, state, requests, mode, memory = [], language = "cs") {
  if (mode === "none") return { text: "", records: [] };
  const words = translations[language] ?? translations.en;
  const rows = [];
  const seen = new Set();
  for (const request of requests) {
    const id = request.optionId;
    if (!oilOptionIds.includes(id) || seen.has(id)) continue;
    seen.add(id);
    const own = request.source === "selected" ? operationPartsSource(state, id) : request.source === "customer" ? true : false;
    const suppliers = request.source === "compare" ? [false, true] : own === null ? [] : [own];
    const variants = suppliers.flatMap((customerParts) => {
      const quote = getPriceQuote(company, "oil_filters", id,
        customerParts ? company.laborRates.customerPartsKcPerHour : company.laborRates.standardKcPerHour);
      return quote?.kind === "labor_only" ? [{ customerParts, priceFromKc: quote.priceFromKc }] : [];
    });
    if (!variants.length) continue;
    const selection = operationPartsSource(state, id);
    const history = memory.filter((record) => record.optionId === id);
    const previous = history.at(-1);
    const applicable = [];
    if (previous?.source === "compare") applicable.push(previous);
    else {
      for (const record of [...history].reverse()) {
        if (record.selectedAtQuote !== selection) break;
        applicable.push(record);
      }
    }
    const repeated = variants.every((variant) => applicable.some((record) => record.variants?.some((old) => old.customerParts === variant.customerParts && old.priceFromKc === variant.priceFromKc)));
    if (mode === "automatic" && repeated) continue;
    rows.push({ optionId: id, source: request.source, selectedAtQuote: selection, variants });
  }
  if (!rows.length) return { text: "", records: [] };
  const comparison = rows.some((row) => row.variants.length === 2);
  const [operation, price, service, customer] = words.headers;
  const table = comparison ? [`| ${operation} | ${service} | ${customer} |`, "|---|---:|---:|"] : [`| ${operation} | ${price} |`, "|---|---:|"];
  const amount = (variant) => variant ? `${variant.priceFromKc} Kč` : "—";
  for (const row of rows) {
    const name = words.names[oilOptionIds.indexOf(row.optionId)];
    table.push(comparison
      ? `| ${name} | ${amount(row.variants.find((variant) => !variant.customerParts))} | ${amount(row.variants.find((variant) => variant.customerParts))} |`
      : `| ${name} | ${amount(row.variants[0])} |`);
  }
  const hasServiceMaterial = rows.some((row) => row.variants.some((variant) => !variant.customerParts) ||
    (row.optionId === "engine_oil" && ["engineOil", "oilFilter"].some((key) => partSource(state, key) === false)));
  return { text: [table.join("\n"), hasServiceMaterial ? words.note : ""].filter(Boolean).join("\n\n"), records: rows };
}
