import { readActiveGuideIds, normalizeGuideIds } from "./guides/registry.mjs";
import { getReply } from "./service.mjs";
import { APIConnectionTimeoutError, APIConnectionError, InternalServerError } from "openai";
import { beginPendingChat, finishPendingChat, failPendingChat, chatSessionSnapshot, previousSentRequest } from "./pending-chat.mjs";
import {
  reviewAppointment,
  appointmentContext,
  partialDateQuestion,
  appointmentIssueMessage,
  inspectAppointmentPreference,
  closedDayMessage,
  closedDayNote,
} from "./appointment-calendar.mjs";
import {
  normalizeIntakeState,
  missingIntakeFields,
  emptyIntakeState,
  hasValidContact,
} from "./intake.mjs";
import {
  handleSendConfirmation,
  presentRequestStep,
  readyToSend,
  wasRequestSent,
  deliveryStatus,
  hasUnsentChanges,
} from "./request-flow.mjs";
import {
  getChatSession,
  draftFingerprint,
  hasPendingConfirmation,
  prepareConfirmation,
} from "./chat-session.mjs";
import { messages, clientMessages } from "./messages.mjs";
import { randomUUID } from "node:crypto";

export function createChatHandler({
  loadCompanyData,
  replyToMessage = getReply,
  sendConfirmation = handleSendConfirmation,
  getSession = getChatSession,
}) {
  return async function chatHandler(request, response) {
    const session = getSession(request, response);
    response.locals ??= {};
    response.locals.language = session.language;
    const errors = messages(session.language);
    const { message, confirmationToken, messageId, conversationId } =
      request.body ?? {};
    if (typeof message !== "string" || !message.trim() || message.length > 1000)
      return response
        .status(400)
        .json({ error: errors.invalidMessage });
    if (
      confirmationToken != null &&
      (typeof confirmationToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(confirmationToken))
    )
      return response
        .status(400)
        .json({ error: errors.invalidConfirmation });
    if (
      messageId != null &&
      (typeof messageId !== "string" || !/^[\w-]{1,100}$/.test(messageId))
    )
      return response
        .status(400)
        .json({ error: errors.invalidMessageId });
    if (!session.acquire())
      return response
        .status(409)
        .json({ error: messages(session.language).busy });
    const controller = new AbortController();
    // Browser disconnects do not cancel accepted work.
    const deadline = setTimeout(() => controller.abort(), 65000);
    deadline.unref?.();
    try {
      if (conversationId != null && conversationId !== session.requestId)
        return response
          .status(409)
          .json({ error: errors.staleConversation });
      // If this lock was acquired while a persisted request remained, its old
      // worker is gone. Record failure; never replay a possible mail operation.
      failPendingChat(session);
      const cached =
        messageId && session.responses?.find((item) => item.id === messageId);
            if (cached) {
        if (cached.message !== message) {
          return response
            .status(409)
            .json({ error: errors.reusedMessageId });
        }

        const currentToken = hasPendingConfirmation(session)
          ? session.confirmation.token
          : null;

        const cachedToken = cached.body.confirmationToken ?? null;

        const cachedDateValid = !cachedToken || inspectAppointmentPreference(cached.body.intake?.preferredTime).valid;
        const matchesCurrentState =
          cachedDateValid &&
          cached.body.conversationId === session.requestId &&
          cached.body.revision === session.revision &&
          cachedToken === currentToken;

        if (!matchesCurrentState) {
          return response
            .status(409)
            .json({ error: errors.staleConversation });
        }

        return response.json({
          ...cached.body,
          language: session.language,
          clientMessages: clientMessages(session.language),
        });
      }
      if (messageId && session.history.some(entry => entry.role === "user" && entry.id === messageId)) {
        return response.status(409).json({ error: errors.staleConversation });
      }
      const repo = session.repository;
            if (
        repo.activeCount() > 12 ||
        !repo.allowMany([
          {
            bucket: "chat-ip:" + request.ip,
            limit: 30,
            windowMs: 60000,
          },
          {
            bucket: "chat-global",
            limit: 120,
            windowMs: 60000,
          },
        ])
      )
        return response
          .status(429)
          .json({ error: messages(session.language).limit });
      const company = await loadCompanyData();
      const intake = normalizeIntakeState(
        structuredClone(session.intake),
        company,
      );
      // Короткий контекст для ИИ; полная переписка остаётся в session.history.
const history = session.history.slice(-30).map(({ role, content }) => ({
  role,
  content,
}));

while (
  history.reduce((total, entry) => total + entry.content.length, 0) > 24000
) {
  history.shift();
}
      const userMessage = beginPendingChat(session, message, messageId);
      const rejectPending = (status, body) => {
        failPendingChat(session, body.error ?? messages(session.language).unavailable);
        if (!response.destroyed && !response.writableEnded) return response.status(status).json(body);
      };
      const answer = (
        body,
        { confirm = false, preserveConfirmation = false } = {},
      ) => {
        const next = normalizeIntakeState(
          body.intake ?? session.intake,
          company,
        );
        // Only meaningful draft changes invalidate the version; bookkeeping does not.
        if (draftFingerprint(next) !== draftFingerprint(session.intake))
          session.revision++;
        session.intake = next;
        if (confirm) prepareConfirmation(session);
        else if (!preserveConfirmation || !hasPendingConfirmation(session))
          session.confirmation = null;
        const assistantMessage = finishPendingChat(session, body.reply);
                const result = {
          ...body,
          userMessage,
          assistantMessage,
          intake: structuredClone(next),
          confirmationToken: session.confirmation?.token ?? null,
          conversationId: session.requestId,
          revision: session.revision,
          language: session.language,
          clientMessages: clientMessages(session.language),
        };
        if (messageId) {
          session.responses ??= [];
          session.responses.push({ id: messageId, message, body: result });
          session.responses = session.responses.slice(-50);
        }
        session.persist();
        if (!response.destroyed && !response.writableEnded) return response.json(result);
      };
      const result = await replyToMessage(
        message,
        company,
        history,
        intake,
        controller.signal,
        wasRequestSent(session),
        undefined,
        hasPendingConfirmation(session),
        {
          activeGuides: readActiveGuideIds(session),
          priceMemory: session.priceMemory ?? [],
          oilPriceMemory: session.oilPriceMemory ?? [],
          closedDayReview: session.closedDayReview ?? null,
          pendingDateReview: session.pendingDateReview ?? null,
          language: session.language,
          previousSentRequest: previousSentRequest(session),
          deliveryStatus: deliveryStatus(session),
          hasUnsentChanges: hasUnsentChanges(session),
        },
      );
      if (controller.signal.aborted) throw new Error("Chat processing timed out");
      if (result.kind === "refusal")
        return answer({
          reply: messages(session.language).refusal,
          intake,
          missingFields: missingIntakeFields(intake, company),
        });
      if (
        result.kind !== "reply" ||
        typeof result.text !== "string" ||
        !result.text.trim()
      )
        return rejectPending(502, { error: messages(session.language).unavailable });
      if (["cs", "sk", "en", "ru", "uk", "de"].includes(result.language))
        session.language = result.language;
      response.locals.language = session.language;
      const t = messages(session.language);
      if (Array.isArray(result.activeGuides)) {
        session.activeGuides = normalizeGuideIds(result.activeGuides);
        delete session.activeGuide;
      }

      const next = normalizeIntakeState(result.intake, company);
      const lastAssistant = [...history].reverse()
        .find((entry) => entry.role === "assistant")?.content ?? "";
      const calendar = appointmentContext(
        message, intake, session.closedDayReview, company,
      );
      const awaitingDate = /(?:termín|datum|kdy|date|appointment|дата|термін|Termin)/iu
        .test(lastAssistant) && /[?？]/u.test(lastAssistant);

      if (
        next.intent === "service_request" &&
        calendar.requiresFullDateConfirmation &&
        calendar.requested &&
        (awaitingDate || session.pendingDateReview)
      ) {
        session.pendingDateReview = calendar.requested.date;
        next.preferredTime = intake.preferredTime;
        return answer({
          reply: [
            result.safetyWarning?.trim(),
            partialDateQuestion(calendar.requested.date, session.language),
          ].filter(Boolean).join("\n\n"),
          intake: next,
          missingFields: missingIntakeFields(next, company),
        });
      }

      if (session.pendingDateReview) {
        const pendingDate = session.pendingDateReview;
        if (/^(?:ano|jo|jasně|přesně|yes|yep|ja|да|так)(?:\s|[.,!?]|$)/iu.test(message.trim())) {
          const proposed = inspectAppointmentPreference(next.preferredTime);
          const userMentionedTime = /(?:\d{1,2}:\d{2}|kolem\s*\d{1,2}|okolo\s*\d{1,2}|around\s*\d{1,2})/iu.test(message);
          const timeMatch = userMentionedTime
            ? String(next.preferredTime ?? "").match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/u) ??
              result.text.match(/(?:kolem|okolo|around)\s*([01]?\d|2[0-3]):([0-5]\d)/iu)
            : null;
          const time = timeMatch
            ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`
            : null;
          next.preferredTime = proposed.valid && proposed.date === pendingDate
            ? next.preferredTime
            : time && inspectAppointmentPreference(`${pendingDate} ${time}`).valid
              ? `${pendingDate} ${time}`
              : pendingDate;
          session.pendingDateReview = null;
        } else if (/^(?:ne|nikoliv|нет|ні)(?:\s|[.,!?]|$)/iu.test(message.trim())) {
          session.pendingDateReview = null;
          next.preferredTime = intake.preferredTime;
          return answer({
            reply: {
              cs: "Jaký jiný termín by Vám vyhovoval?",
              sk: "Aký iný termín by Vám vyhovoval?",
              en: "What other date would suit you?",
              ru: "Какая другая дата вам подойдёт?",
              uk: "Яка інша дата Вам підійде?",
              de: "Welcher andere Termin würde Ihnen passen?",
            }[session.language] ?? "What other date would suit you?",
            intake: next,
            missingFields: missingIntakeFields(next, company),
          });
        } else if (/(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s*[./]\s*\d{1,2}|\d{1,2}\s+(?:ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince|januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra|january|february|march|april|may|june|july|august|september|october|november|december))/iu.test(message)) {
          session.pendingDateReview = null;
        } else {
          // An opening-hours question does not answer the date question.
          next.preferredTime = intake.preferredTime;
          next.intent = intake.intent;
        }
      }

      if (
        !hasValidContact(intake.customer) &&
        hasValidContact(next.customer) &&
        inspectAppointmentPreference(intake.preferredTime).valid &&
        !/(?:termín|datum|zítra|zitra|kolem|hodin|date|tomorrow|дата|завтра|Termin|morgen)/iu.test(message)
      ) {
        next.preferredTime = intake.preferredTime;
      }

      const newContact = !hasValidContact(intake.customer) &&
        hasValidContact(next.customer);
      const declinesExtras = /(?:nic dalšího|nic dalsiho|nechci nic|nothing else|ничего больше|нічого більше|nichts weiter)/iu
        .test(message);
      const addedWork = JSON.stringify(next.selectedOperations) !==
        JSON.stringify(intake.selectedOperations);
      if (
        next.intent === "service_request" &&
        newContact &&
        !intake.additionalServicesReviewed &&
        !declinesExtras &&
        !addedWork &&
        missingIntakeFields(next, company).length === 0 &&
        next.pendingDetails.length === 0
      ) {
        next.additionalServicesReviewed = false;
        if (!/[?？]/u.test(result.text) ||
            !/(?:poznámk|služb|note|service|примечан|услуг|примітк|послуг|Anmerkung|Leistung)/iu.test(result.text)) {
          result.text = {
            cs: "Děkuji, kontakt mám. Chcete k žádosti ještě něco doplnit, například poznámku nebo další službu?",
            sk: "Ďakujem, kontakt mám. Chcete k žiadosti ešte niečo doplniť, napríklad poznámku alebo ďalšiu službu?",
            en: "Thank you, I have your contact details. Would you like to add a note or another service?",
            ru: "Спасибо, контакт записал. Хотите добавить к заявке примечание или ещё одну услугу?",
            uk: "Дякую, контакт записав. Бажаєте додати до заявки примітку або ще одну послугу?",
            de: "Vielen Dank, Ihre Kontaktdaten habe ich. Möchten Sie eine Anmerkung oder eine weitere Leistung ergänzen?",
          }[session.language] ?? "Would you like to add a note or another service?";
        }
        result.hasFollowUp = true;
      }
            const statusOnly =
        result.submissionAction === "ask_status" &&
        draftFingerprint(next) === draftFingerprint(intake);

      if (next.intent === "service_request" && !statusOnly) {
        const review = reviewAppointment({
          previous: intake,
          next,
          message,
          company,
          review: session.closedDayReview,
          keepClosedDay: result.keepClosedDay === true,
        });

        const wasAccepted =
          session.closedDayReview?.accepted === true &&
          session.closedDayReview?.date === review.review?.date;

        session.closedDayReview = review.review;

        if (review.blocked) {
  const dateClarification = review.issue
    ? appointmentIssueMessage(review.issue, session.language)
    : closedDayMessage(review.info, session.language);

  return answer({
    reply: [...new Set([
  result.safetyWarning?.trim(),
  dateClarification,
])]
  .filter(Boolean)
  .join("\n\n"),
    intake: next,
    missingFields: missingIntakeFields(next, company),
  });
}

        if (review.exception && !wasAccepted) {
          result.text =
            closedDayNote(session.language) + "\n\n" + result.text;
        }
      }
      if (result.oilPriceRecords?.length) {
        session.oilPriceMemory ??= [];
        session.oilPriceMemory.push(...result.oilPriceRecords);
        session.oilPriceMemory = session.oilPriceMemory.slice(-100);
      }
      if (result.priceQuoted === true) {
        session.priceMemory ??= [];
        session.priceMemory.push({
          serviceId: next.serviceId,
          serviceOptionId: next.serviceOptionId,
          requestedWork: next.requestedWork,
          customerParts: next.customerParts,
          partsOverrides: structuredClone(next.partsOverrides),
          text: result.text.slice(0, 2500),
        });
        session.priceMemory = session.priceMemory.slice(-20);
      }
      const unchanged = draftFingerprint(next) === draftFingerprint(intake);
      if (result.submissionAction === "ask_status" && unchanged) {
        const status = deliveryStatus(session);
        const statusReply =
          status === "sent"
            ? hasUnsentChanges(session) ? t.updatedDraftNotSent : t.statusSent
            : ["pending", "unknown"].includes(status)
              ? t.unknown
              : t.notSent;
        return answer(
          {
            reply: result.statusFollowUp?.trim()
              ? statusReply + "\n\n" + result.statusFollowUp.trim()
              : statusReply,
            intake,
            missingFields: missingIntakeFields(intake, company),
          },
          { preserveConfirmation: hasPendingConfirmation(session) },
        );
      }
        if (
        result.needsClarification === true ||
        result.hasFollowUp === true
      )
        return answer({
          reply: result.text,
          intake: next,
          missingFields: missingIntakeFields(next, company),
        });
      if (result.submissionAction === "confirm_send" && unchanged) {
        const submission = await sendConfirmation({
          session,
          confirmationToken,
          company,
          ip: request.ip,
        });
        if (submission) {
          if (submission.status !== 200)
            return rejectPending(submission.status, submission.body);
          return answer(submission.body);
        }
        if (readyToSend(intake, company) && !wasRequestSent(session))
          return answer(
            {
              reply: presentRequestStep("", intake, {
                language: session.language,
                company,
              }),
              intake,
              missingFields: [],
            },
            { confirm: true },
          );
      }
      if (result.submissionAction === "decline_send" && unchanged) {
        next.intent = "service_discussion";
        return answer({ reply: result.text, intake: next, missingFields: [] });
      }
      // A changed draft must never be sent under its previous consent.
      if (!unchanged && hasPendingConfirmation(session))
        next.intent = "service_request";
      const pending = hasPendingConfirmation(session);
      const previousSent =
        wasRequestSent(session) &&
        session.repository.delivery(session.lastDelivery)?.data;
      const sameAsSent =
        previousSent &&
        draftFingerprint(previousSent) === draftFingerprint(next);
      const confirm =
        readyToSend(next, company) && !sameAsSent && (!pending || !unchanged);
      return answer(
        {
          reply: presentRequestStep(result.text, next, {
            showConfirmation: confirm,
            language: session.language,
            company,
          }),
          intake: next,
          missingFields: missingIntakeFields(next, company),
        },
        { confirm, preserveConfirmation: pending && unchanged && !confirm },
      );
    } catch (error) {
      const t = messages(session.language);
      const failureText = error instanceof APIConnectionTimeoutError ? t.timeout
        : error?.status === 429 || error instanceof APIConnectionError || error instanceof InternalServerError
          ? t.unavailable : t.requestFailed;
      failPendingChat(session, failureText);
      if (!response.destroyed && !response.writableEnded) throw error;
    } finally {
      clearTimeout(deadline);
      session.release();
    }
  };
}

export function createSessionHandler({
  getSession = getChatSession,
  reset = false,
} = {}) {
  return (request, response) => {
    const session = getSession(request, response);
    if (!session.acquire()) {
      if (!reset && session.pendingRequest) return response.json(chatSessionSnapshot(session));
      return response.status(409).json({ error: messages(session.language).busy });
    }
    try {
      failPendingChat(session);
      if (reset) {
        const previous = previousSentRequest(session, session.lastDelivery) ?? previousSentRequest(session);
        Object.assign(session, {
          restarted: request.body?.reason !== "expired",
          emptyExpiresAt: Date.now() + 5 * 60 * 1000,
          previousDelivery: previous?.deliveryId ?? null,
          requestId: randomUUID(),
          revision: 0,
          confirmation: null,
          history: [],
          pendingRequest: null,
          intake: emptyIntakeState(),
          activeGuide: null,
          activeGuides: [],
          priceMemory: [],
          oilPriceMemory: [],
          closedDayReview: null,
          pendingDateReview: null,
          responses: [],
          lastDelivery: null,
        });
      }
      return response.json(chatSessionSnapshot(session));
    } finally {
      session.release();
    }
  };
}
