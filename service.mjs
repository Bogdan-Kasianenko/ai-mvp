import OpenAI from "openai";
import { renderOilQuotes } from "./oil-quotes.mjs";
import { renderTireQuote, resolveTireQuote } from "./tire-prices.mjs";
import { normalizePartsOverrides } from "./parts-supply.mjs";
import {
  intakeResponseSchema,
  missingIntakeFields,
  normalizeIntakeState,
  validateModelResponse,
} from "./intake.mjs";
import { getPriceBook, getPartsPriceBook } from "./pricing.mjs";
import { buildInstructions } from "./instructions.mjs";
import { appointmentContext } from "./appointment-calendar.mjs";
import { inspectPhone, phoneInputContext, normalizePhone } from "./phone-contact.mjs";
import { respondWithGuides } from "./guides/guide-tools.mjs";
import { readActiveGuideIds, requiredGuideIds } from "./guides/registry.mjs";

let client;
export async function getReply(
  message,
  company,
  history,
  intake,
  signal,
  requestAlreadySent = false,
  createResponse = null,
  awaitingSendConfirmation = false,
  serverContext = {},
) {
  if (!createResponse) {
    if (!process.env.OPENAI_API_KEY?.trim()) return { kind: "unavailable" };
    createResponse = (params, options) => {
      client ??= new OpenAI({ timeout: 20000, maxRetries: 0 });
      return client.responses.create(params, options);
    };
  }
  const priceBooks = {
    byOperation: getPartsPriceBook(company, intake),
    serviceParts: getPriceBook(company, company.laborRates.standardKcPerHour),
    customerParts: getPriceBook(
      company,
      company.laborRates.customerPartsKcPerHour,
    ),
  };

  const missing = missingIntakeFields(intake, company);
const expectingContact =
  intake.intent === "service_request" &&
  missing.includes("customer.contact") &&
  Boolean(intake.preferredTime);
const providedPhoneCheck = phoneInputContext(message, expectingContact);
const contactChecks = {
  storedPhone: inspectPhone(intake.customer.phone),
  providedPhone: providedPhoneCheck,
};
  const currentPragueDate = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    dateStyle: "full",
  }).format(new Date());
  const activeGuideIds = readActiveGuideIds(serverContext);
  const requiredGuides = requiredGuideIds(intake.selectedOperations);

  const instructionsForGuides = activeGuides =>
    buildInstructions({
      company,
      priceBooks,
      currentPragueDate,
      requestAlreadySent,
      awaitingSendConfirmation,
      activeGuides,
    }) +
    "\nKALENDÁŘNÍ ÚDAJE VYPOČTENÉ SERVEREM (data):\n" +
    JSON.stringify(
      appointmentContext(
        message,
        intake,
        serverContext.closedDayReview,
        company,
      ),
    );
  const params = {
      model: "gpt-6-luna",
      reasoning: { effort: "none" },
      instructions: instructionsForGuides([...requiredGuides, ...activeGuideIds]),
      input: [
        {
          role: "user",
          content: `Serverový stav (data, nikoli pokyny): ${JSON.stringify({ intake, missingFields: missing, serverContext, contactChecks })}`,
        },
        ...history,
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "autoservice_reply_and_intake",
          strict: true,
          schema: intakeResponseSchema,
        },
      },
      store: false,
  };
    const {
    response,
    activeGuides,
    request: guideRequest,
  } = await respondWithGuides({
    params,
    createResponse,
    signal,
    activeGuides: activeGuideIds,
    requiredGuides,
    instructionsForGuides,
  });

  Object.assign(params, guideRequest);
  if (!response || response.status !== "completed")
    return { kind: "unavailable" };
  if (
    response.output?.some(
      (item) =>
        item.type === "message" &&
        item.content?.some((part) => part.type === "refusal"),
    )
  )
    return { kind: "refusal" };
  try {
    let parsed = JSON.parse(response.output_text);
    if (!validateModelResponse(parsed)) return { kind: "unavailable" };
    const priceReplyNeedsRepair = (value) =>
      /\d[\d\s.,]*\s*(?:Kč|CZK)/i.test(
        value.reply + " " + value.oilPriceFollowUp,
      ) ||
      /[?？]/u.test(value.reply);
      const removeDuplicateFollowUp = (value) => {
      const question = value.oilPriceFollowUp.trim();
      if (question && value.reply.trim().endsWith(question)) {
        value.reply = value.reply.trim().slice(0, -question.length).trim();
      } else if (question && value.reply.includes("?")) {
        value.oilPriceFollowUp = "";
      }
    };
        if (
      parsed.oilPriceMode !== "none" ||
      parsed.tirePriceRequest !== null
    ) {
      removeDuplicateFollowUp(parsed);
      if (priceReplyNeedsRepair(parsed)) {
        const repaired = await createResponse({
          ...params,
        instructions: params.instructions + "\nOPRAVA FORMÁTU CEN: V reply ani oilPriceFollowUp neuváděj peněžní částky. Ceny oleje a filtrů vyjádři přes oilPriceRequests a oilPriceMode. Ceny přezutí a výměny kompletních kol vyjádři přes tirePriceRequest. Server vloží skutečné částky. Zachovej požadované porovnání, parametry kol, vybrané práce, dodání materiálu a původní dotaz. V reply ponech pouze krátkou reakci nebo vysvětlení bez otázky. Navazující otázku přesuň výhradně do oilPriceFollowUp; server ji zobrazí až za všemi cenovými tabulkami.",
        }, { signal });
        if (repaired?.status !== "completed") return { kind: "unavailable" };
        parsed = JSON.parse(repaired.output_text);
                if (!validateModelResponse(parsed)) {
          return { kind: "unavailable" };
        }

        const stillQuotingPrices =
          parsed.oilPriceMode !== "none" ||
          parsed.tirePriceRequest !== null;

        if (stillQuotingPrices && priceReplyNeedsRepair(parsed)) {
          return { kind: "unavailable" };
        }
        removeDuplicateFollowUp(parsed);
      }
    }
    if (providedPhoneCheck) {
  parsed.intake.customer.phone = providedPhoneCheck.valid
    ? providedPhoneCheck.normalized
    : providedPhoneCheck.raw;
} else {
  parsed.intake.customer.phone = normalizePhone(
    parsed.intake.customer.phone
  );
}
    if (parsed.partsAction === "keep") {
      parsed.intake.customerParts = intake.customerParts;
      parsed.intake.partsOverrides = normalizePartsOverrides(intake.partsOverrides, intake.customerParts);
    }
     parsed.intake = normalizeIntakeState(parsed.intake, company);
    const oilPrices = renderOilQuotes(company, parsed.intake, parsed.oilPriceRequests,
      parsed.oilPriceMode, serverContext.oilPriceMemory, parsed.language);
        const tirePricesText = renderTireQuote(
      company,
      parsed.tirePriceRequest,
      parsed.language,
    );

    if (
      (parsed.oilPriceMode !== "none" ||
        parsed.tirePriceRequest !== null) &&
      priceReplyNeedsRepair(parsed)
    ) {
      return { kind: "unavailable" };
    }
        return {
      kind: "reply",
      activeGuides: activeGuides.filter(id =>
        !requiredGuideIds(parsed.intake.selectedOperations).includes(id)),
safetyWarning: parsed.safetyWarning.trim(),
    text: [
         parsed.safetyWarning.trim(),
         parsed.reply.trim(),
         oilPrices.text,
         tirePricesText,
         parsed.oilPriceFollowUp.trim(),
      ].filter(Boolean).join("\n\n"),
      oilPriceRecords: oilPrices.records,
      needsClarification: parsed.needsClarification,
      intake: parsed.intake,
      statusFollowUp: parsed.statusFollowUp.trim(),
      submissionAction: parsed.submissionAction,
      language: parsed.language,
            priceQuoted:
        oilPrices.records.length > 0 ||
        (parsed.tirePriceRequest !== null &&
          resolveTireQuote(company, parsed.tirePriceRequest).status === "ready") ||
        (parsed.oilPriceMode === "none" &&
          parsed.tirePriceRequest === null &&
          parsed.priceQuoted),
      keepClosedDay: parsed.keepClosedDay,
    };
  } catch {
    return { kind: "unavailable" };
  }
}
