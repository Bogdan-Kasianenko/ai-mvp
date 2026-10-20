import OpenAI from "openai";
import { renderOilQuotes } from "./oil-quotes.mjs";
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
const expectingContact = intake.intent === "service_request" &&
  missing.includes("customer.contact") &&
  missing.every((field) => ["customer.name", "customer.contact"].includes(field));
const providedPhoneCheck = phoneInputContext(message, expectingContact);
const contactChecks = {
  storedPhone: inspectPhone(intake.customer.phone),
  providedPhone: providedPhoneCheck,
};
  const currentPragueDate = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    dateStyle: "full",
  }).format(new Date());
  const params = {
      model: "gpt-6-luna",
      reasoning: { effort: "none" },
            instructions:
        buildInstructions({
          company,
          priceBooks,
          currentPragueDate,
          requestAlreadySent,
          awaitingSendConfirmation,
        }) +
        "\nKALENDÁŘNÍ ÚDAJE VYPOČTENÉ SERVEREM (data):\n" +
        JSON.stringify(
          appointmentContext(
            message,
            intake,
            serverContext.closedDayReview,
            company,
          ),
        ),
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
  const response = await createResponse(params, { signal });
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
    const priceTextHasAmount = (value) => /\d[\d\s.,]*\s*(?:Kč|CZK)/i.test(value.reply + " " + value.oilPriceFollowUp);
    const removeDuplicateFollowUp = (value) => {
      const question = value.oilPriceFollowUp.trim();
      if (question && value.reply.trim().endsWith(question)) {
        value.reply = value.reply.trim().slice(0, -question.length).trim();
      } else if (question && value.reply.includes("?")) {
        value.oilPriceFollowUp = "";
      }
    };
    if (parsed.oilPriceMode !== "none") {
      removeDuplicateFollowUp(parsed);
      if (priceTextHasAmount(parsed)) {
        const repaired = await createResponse({
          ...params,
          instructions: params.instructions + "\nOPRAVA FORMÁTU CEN: V reply ani oilPriceFollowUp nesmí být žádná částka v Kč nebo CZK, ani oprava dřívější částky. Veškeré ceny oleje a filtrů vyjádři jen pomocí oilPriceRequests. Server vypočte tabulku. Zachovej odpověď na původní dotaz a správný výběr materiálu. Navazující otázku napiš jen jednou do oilPriceFollowUp.",
        }, { signal });
        if (repaired?.status !== "completed") return { kind: "unavailable" };
        parsed = JSON.parse(repaired.output_text);
        if (!validateModelResponse(parsed) || priceTextHasAmount(parsed)) return { kind: "unavailable" };
        removeDuplicateFollowUp(parsed);
      }
    }
    if (providedPhoneCheck) {
  parsed.intake.customer.phone = providedPhoneCheck.valid
    ? providedPhoneCheck.normalized : message.trim();
} else {
  parsed.intake.customer.phone = normalizePhone(parsed.intake.customer.phone);
}
    if (parsed.partsAction === "keep") {
      parsed.intake.customerParts = intake.customerParts;
      parsed.intake.partsOverrides = normalizePartsOverrides(intake.partsOverrides, intake.customerParts);
    }
     parsed.intake = normalizeIntakeState(parsed.intake, company);
    const oilPrices = renderOilQuotes(company, parsed.intake, parsed.oilPriceRequests,
      parsed.oilPriceMode, serverContext.oilPriceMemory, parsed.language);
    if (parsed.oilPriceMode !== "none" && /\d[\d\s.,]*\s*(?:Kč|CZK)/i.test(parsed.reply + " " + parsed.oilPriceFollowUp)) {
      return { kind: "unavailable" };
    }
    return {
      kind: "reply",
      text: [parsed.reply.trim(), oilPrices.text, parsed.oilPriceFollowUp.trim()].filter(Boolean).join("\n\n"),
      oilPriceRecords: oilPrices.records,
      needsClarification: parsed.needsClarification,
      intake: parsed.intake,
      statusFollowUp: parsed.statusFollowUp.trim(),
      submissionAction: parsed.submissionAction,
      language: parsed.language,
      priceQuoted: parsed.oilPriceMode === "none" ? parsed.priceQuoted : oilPrices.records.length > 0,
      keepClosedDay: parsed.keepClosedDay,
    };
  } catch {
    return { kind: "unavailable" };
  }
}
