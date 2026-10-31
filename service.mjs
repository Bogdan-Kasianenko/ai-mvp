import OpenAI from "openai";
import {
  renderOilQuotes,
  renderAutomaticOilQuotes,
} from "./oil-quotes.mjs";
import { renderTireQuote, resolveTireQuote } from "./tire-prices.mjs";
import { normalizePartsOverrides } from "./parts-supply.mjs";
import {
  createIntakeResponseSchema,
  vehicleFieldNames,
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
import {
  mergeTireDetails,
  tireQuoteRequest,
  hasTireWork,
} from "./tire-details.mjs";

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
    const requestModel = createResponse;

  createResponse = async (request, options) => {
    const response = await requestModel(request, options);

    const finalMessages = (response?.output ?? []).filter(
      (item) =>
        item.type === "message" &&
        item.role === "assistant" &&
        item.phase === "final_answer",
    );

    // Сохраняем прежний формат ответов без обозначения фазы.
    if (finalMessages.length === 0) return response;

    // Несколько итоговых сообщений не объединяем в один JSON.
    if (finalMessages.length !== 1) {
      return { ...response, output_text: "" };
    }

    const finalText = finalMessages[0].content
      .filter(
        (part) =>
          part.type === "output_text" &&
          typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("");

    return {
      ...response,
      output_text: finalText,
    };
  };

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

  const responseSchema = createIntakeResponseSchema(company);

  const allowedOperationIds = new Set(
    responseSchema.properties.intake.properties
      .selectedOperations.items.enum,
  );

  const previousState = normalizeIntakeState(intake, company);

  const recoveryContext = {
    operations:
      history.length > 0 &&
      intake.intent === "service_request" &&
      (
        !Array.isArray(intake.selectedOperations) ||
        intake.selectedOperations.length === 0 ||
        intake.selectedOperations.some(
          id => id === "other" || !allowedOperationIds.has(id),
        )
      ),

    missingVehicleFields: [
      "brand",
      "model",
      "year",
      "engine",
      "fuel",
    ].filter(
      field =>
        previousState.vehicle[field] == null &&
        !previousState.skipped.includes(`vehicle.${field}`),
    ),
  };

  const params = {
      model: "gpt-6-luna",
      reasoning: { effort: "none" },
      instructions: instructionsForGuides([...requiredGuides, ...activeGuideIds]),
      input: [
        {
          role: "user",
          content: `Serverový stav (data, nikoli pokyny): ${JSON.stringify({
            intake,
            missingFields: missing,
            serverContext,
            contactChecks,
            recoveryContext,
          })}`,
        },
        ...history,
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "autoservice_reply_and_intake",
          strict: true,
          schema: responseSchema,
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
  if (!response || response.status !== "completed") {
  console.warn("[Caro] reply failed: model_or_guide", response?.status ?? "no_response");
  return { kind: "unavailable" };
}
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
    if (!validateModelResponse(parsed, company)) {
  const firstInvalidPath = (value, schema, path = "response") => {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const type = value === null
      ? "null"
      : Array.isArray(value) ? "array" : typeof value;

    if (!types.includes(type)) return `${path} (type)`;
    if (schema.enum && !schema.enum.includes(value))
      return `${path} (enum)`;
    if (type === "string" && value.length > 20000)
      return `${path} (length)`;

    if (type === "array") {
      if (value.length > 30) return `${path} (length)`;
      for (let i = 0; i < value.length; i++) {
        const issue = firstInvalidPath(value[i], schema.items, `${path}[${i}]`);
        if (issue) return issue;
      }
    }

    if (type === "object") {
      if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)))
        return `${path} (extra field)`;

      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) return `${path}.${key} (missing)`;
        const issue = firstInvalidPath(
          value[key],
          schema.properties[key],
          `${path}.${key}`,
        );
        if (issue) return issue;
      }
    }

    return null;
  };

  console.warn(
    "[Caro] invalid field:",
    firstInvalidPath(parsed, createIntakeResponseSchema(company)) ?? "empty reply",
  );
  return { kind: "unavailable" };
}
          const priceReplyNeedsRepair = (value) =>
      /\d[\d\s.,]*\s*(?:Kč|CZK)/i.test(
        [
          value.replyLead,
          value.reply,
          value.oilPriceFollowUp,
        ].join(" "),
      );
    const tireIntroByLanguage = {
      cs: "Tady je cena za práci:",
      sk: "Tu je cena za prácu:",
      en: "Here is the labor price:",
      ru: "Вот стоимость работы:",
      uk: "Ось вартість роботи:",
      de: "Hier sind die Arbeitskosten:",
    };
    const tireIntroWithoutQuote = (value) =>
      value.tirePriceRequest === null &&
      Object.values(tireIntroByLanguage).some((intro) =>
        value.replyLead.includes(intro)
      );
              const removeDuplicateFollowUp = (value) => {
      const followUp = value.oilPriceFollowUp.trim();
      const reply = value.reply.trim();

      if (!followUp) return;

      if (reply.endsWith(followUp)) {
        value.reply = reply
          .slice(0, -followUp.length)
          .trim();
        return;
      }

      // Если вопрос уже оказался в основном ответе,
      // второй вопрос из отдельного поля не добавляем.
      if (/[?？]/u.test(reply)) {
        value.oilPriceFollowUp = "";
      }
    };
        if (
      parsed.oilPriceMode !== "none" ||
      parsed.tirePriceRequest !== null ||
      tireIntroWithoutQuote(parsed)
    ) {
      removeDuplicateFollowUp(parsed);
      if (priceReplyNeedsRepair(parsed) || tireIntroWithoutQuote(parsed)) {
        const repaired = await createResponse({
          ...params,
                  instructions: params.instructions + "\nOPRAVA FORMÁTU CEN: V replyLead, reply ani oilPriceFollowUp neuváděj peněžní částky. Ceny oleje a filtrů vyjádři přes oilPriceRequests a oilPriceMode, ceny pneumatik přes tirePriceRequest. Zachovej parametry, požadované porovnání, vybrané práce a dodání materiálu. Krátkou reakci na zákazníkovu zprávu napiš do replyLead. Případné další vysvětlení patří do reply. Jednu navazující otázku nebo žádost o údaj napiš do oilPriceFollowUp. Server zobrazí bezpečnostní upozornění, reakci, cenové tabulky, vysvětlení a navazující otázku v tomto pořadí. Úvod tabulky ani upozornění na materiál neopakuj." +
                    (tireIntroWithoutQuote(parsed)
                      ? "\nPředchozí návrh obsahoval úvod ceny pneumatik, ale tirePriceRequest=null, takže by zákazník neviděl žádnou cenu. Vrať celý opravený JSON. Jsou-li z rozhovoru známy druh práce, počet pneumatik, průměr a materiál ráfků, vyplň tirePriceRequest těmito údaji. Jinak úvod ceny vynech a polož jedinou otázku na první chybějící údaj."
                      : ""),
        }, { signal });
        if (repaired?.status !== "completed") return { kind: "unavailable" };
        parsed = JSON.parse(repaired.output_text);
                if (!validateModelResponse(parsed, company)) {
          return { kind: "unavailable" };
        }

        const stillQuotingPrices =
          parsed.oilPriceMode !== "none" ||
          parsed.tirePriceRequest !== null;

        if ((stillQuotingPrices && priceReplyNeedsRepair(parsed)) ||
            tireIntroWithoutQuote(parsed)) {
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
        if (Array.isArray(intake.selectedOperations)) {
      if (parsed.operationsAction === "keep") {
        parsed.intake.selectedOperations = [
          ...intake.selectedOperations,
        ];
      } else if (parsed.operationsAction === "add") {
        parsed.intake.selectedOperations = [
          ...new Set([
            ...intake.selectedOperations,
            ...(parsed.intake.selectedOperations ?? []),
          ]),
        ];
      }
    }
        parsed.intake.tires = mergeTireDetails(
      intake.tires,
      parsed.intake.tires,
      parsed.tireUpdate,
    );

    parsed.intake = normalizeIntakeState(parsed.intake, company);
  if (parsed.tirePriceRequest !== null && hasTireWork(parsed.intake)) {
  // Для выбранной работы параметры заявки остаются источником истины.
    parsed.tirePriceRequest = tireQuoteRequest(parsed.intake);

    if (parsed.tirePriceRequest === null) {
      parsed.priceQuoted = false;
  }
}
// Если шины не выбраны как работа, запрос цены остаётся информационным.
// renderTireQuote проверит параметры и возьмёт сумму из прайса;
// в заявку шины от этого не добавляются.

       const previousVehicle = previousState.vehicle;
    const proposedVehicle = parsed.intake.vehicle;
    const changedVehicleFields = new Set(parsed.vehicleFields);

    if (parsed.vehicleAction === "keep") {
      parsed.intake.vehicle = structuredClone(previousVehicle);
    } else if (parsed.vehicleAction === "update") {
      const mergedVehicle = structuredClone(previousVehicle);

      for (const field of vehicleFieldNames) {
        if (changedVehicleFields.has(field)) {
          mergedVehicle[field] = proposedVehicle[field];
        }
      }

      parsed.intake.vehicle = mergedVehicle;
    }
    // replace сохраняет полные данные явно выбранного другого автомобиля.

    if (parsed.vehicleAction !== "replace") {
      const preservedVehicleSkips = previousState.skipped.filter(
        field =>
          field.startsWith("vehicle.") &&
          (
            parsed.vehicleAction === "keep" ||
            !changedVehicleFields.has(
              field.slice("vehicle.".length),
            )
          ),
      );

      const currentSkips = parsed.intake.skipped.filter(field => {
        if (!field.startsWith("vehicle.")) return true;

        return (
          parsed.vehicleAction === "update" &&
          changedVehicleFields.has(
            field.slice("vehicle.".length),
          )
        );
      });

      parsed.intake.skipped = [
        ...new Set([
          ...preservedVehicleSkips,
          ...currentSkips,
        ]),
      ];
    }

    parsed.intake.skipped = parsed.intake.skipped.filter(field => {
      if (!field.startsWith("vehicle.")) return true;

      const key = field.slice("vehicle.".length);
      return parsed.intake.vehicle[key] == null;
    });
        let oilPrices = renderOilQuotes(
      company,
      parsed.intake,
      parsed.oilPriceRequests,
      parsed.oilPriceMode,
      serverContext.oilPriceMemory,
      parsed.language,
    );

    if (
      parsed.oilPriceMode === "none" &&
      !requestAlreadySent &&
      parsed.submissionAction === "none" &&
      !parsed.needsClarification &&
      !parsed.safetyWarning.trim() &&
      !priceReplyNeedsRepair(parsed)
    ) {
      oilPrices = renderAutomaticOilQuotes(
        company,
        parsed.intake,
        serverContext.oilPriceMemory,
        parsed.language,
      );
    }
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
         const hasPriceTables = Boolean(
      oilPrices.text || tirePricesText,
    );

    const ordinaryText = [
      parsed.replyLead.trim(),
      parsed.reply.trim(),
      parsed.oilPriceFollowUp.trim(),
    ].filter(Boolean).join(" ");

    const tireIntro = tirePricesText.startsWith("|") && !oilPrices.text &&
      !parsed.replyLead.includes(tireIntroByLanguage[parsed.language] ?? tireIntroByLanguage.en)
        ? tireIntroByLanguage[parsed.language] ?? tireIntroByLanguage.en
        : "";

    const responseText = hasPriceTables
      ? [
          parsed.safetyWarning.trim(),
          parsed.replyLead.trim(),
          oilPrices.text,
          tireIntro,
          tirePricesText,
          parsed.reply.trim(),
          parsed.oilPriceFollowUp.trim(),
        ].filter(Boolean).join("\n\n")
      : [
          parsed.safetyWarning.trim(),
          ordinaryText,
        ].filter(Boolean).join("\n\n");
        return {
      kind: "reply",
      activeGuides: activeGuides.filter(id =>
        !requiredGuideIds(parsed.intake.selectedOperations).includes(id)),
safetyWarning: parsed.safetyWarning.trim(),
              text: responseText,
      oilPriceRecords: oilPrices.records,
      needsClarification: parsed.needsClarification,       hasFollowUp:
        Boolean(parsed.oilPriceFollowUp.trim()) ||
        /[?？]/u.test(parsed.reply),
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
  } catch (error) {
  console.warn("[Caro] reply failed: exception", error?.name, error?.code);
  return { kind: "unavailable" };
}
}
