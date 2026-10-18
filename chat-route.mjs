import { getReply } from "./service.mjs";
import {
  reviewAppointment,
  closedDayMessage,
  closedDayNote,
} from "./appointment-calendar.mjs";
import {
  normalizeIntakeState,
  missingIntakeFields,
  emptyIntakeState,
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
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", onClose);
    try {
      if (conversationId != null && conversationId !== session.requestId)
        return response
          .status(409)
          .json({ error: errors.staleConversation });
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

        const matchesCurrentState =
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
      const repo = session.repository;
      if (
        repo.activeCount() > 12 ||
        !repo.allow("chat-ip:" + request.ip, 30, 60000) ||
        !repo.allow("chat-global", 120, 60000)
      )
        return response
          .status(429)
          .json({ error: messages(session.language).limit });
      const company = await loadCompanyData();
      const intake = normalizeIntakeState(
        structuredClone(session.intake),
        company,
      );
      const history = session.history.map(({ role, content }) => ({
        role,
        content,
      }));
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
                const previousTime = Date.parse(session.history.at(-1)?.at ?? "");

        const userTime = Math.max(
          Date.now(),
          Number.isFinite(previousTime) ? previousTime + 1 : 0,
        );

        const userMessage = {
          role: "user",
          content: message.trim(),
          id: messageId ?? randomUUID(),
          at: new Date(userTime).toISOString(),
        };

        const assistantMessage = {
          role: "assistant",
          content: body.reply,
          id: randomUUID(),
          at: new Date(userTime + 1).toISOString(),
        };

        session.history.push(userMessage, assistantMessage);
        while (
          session.history.length > 30 ||
          session.history.reduce((n, x) => n + x.content.length, 0) > 24000
        )
          session.history.shift();
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
        if (!controller.signal.aborted) return response.json(result);
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
          priceMemory: session.priceMemory ?? [],
          closedDayReview: session.closedDayReview ?? null,
          language: session.language,
          deliveryStatus: deliveryStatus(session),
          hasUnsentChanges: hasUnsentChanges(session),
        },
      );
      if (controller.signal.aborted) return;
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
        return response
          .status(502)
          .json({ error: messages(session.language).unavailable });
      if (["cs", "sk", "en", "ru", "uk", "de"].includes(result.language))
        session.language = result.language;
      response.locals.language = session.language;
      const t = messages(session.language);
      const next = normalizeIntakeState(result.intake, company);
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
          return answer({
            reply: closedDayMessage(review.info, session.language),
            intake: next,
            missingFields: missingIntakeFields(next, company),
          });
        }

        if (review.exception && !wasAccepted) {
          result.text =
            closedDayNote(session.language) + "\n\n" + result.text;
        }
      }
      if (result.priceQuoted === true) {
        session.priceMemory ??= [];
        session.priceMemory.push({
          serviceId: next.serviceId,
          serviceOptionId: next.serviceOptionId,
          requestedWork: next.requestedWork,
          customerParts: next.customerParts,
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
      if (result.needsClarification === true)
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
            return response.status(submission.status).json(submission.body);
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
    } finally {
      session.release();
      response.off("close", onClose);
    }
  };
}

export function createSessionHandler({
  getSession = getChatSession,
  reset = false,
} = {}) {
  return (request, response) => {
    const session = getSession(request, response);
    if (!session.acquire())
      return response
        .status(409)
        .json({ error: messages(session.language).busy });
    try {
      if (reset)
        Object.assign(session, {
          requestId: randomUUID(),
          revision: 0,
          confirmation: null,
          history: [],
          intake: emptyIntakeState(),
          priceMemory: [],
          closedDayReview: null,
          responses: [],
          lastDelivery: null,
        });
      return response.json({
        conversationId: session.requestId,
        revision: session.revision,
        language: session.language,
        clientMessages: clientMessages(session.language),
        history: session.history,
        intake: session.intake,
        confirmationToken: hasPendingConfirmation(session)
          ? session.confirmation.token
          : null,
      });
    } finally {
      session.release();
    }
  };
}
