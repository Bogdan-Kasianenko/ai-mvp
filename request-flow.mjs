import { createHash } from "node:crypto";
import { missingIntakeFields } from "./intake.mjs";
import { sendServiceRequest } from "./mailer.mjs";
import { confirmationMatches, draftFingerprint, hasPendingConfirmation } from "./chat-session.mjs";
import { messages } from "./messages.mjs";
import { describeParts } from "./parts-supply.mjs";

export function deliveryStatus(session) {
  return session?.lastDelivery
    ? (session.repository.delivery(session.lastDelivery)?.status ?? "unknown")
    : "not_sent";
}
export function wasRequestSent(session) {
  return deliveryStatus(session) === "sent";
}
export function hasUnsentChanges(session) {
  if (!wasRequestSent(session)) return false;
  const sent = session.repository.delivery(session.lastDelivery).data;
  return Boolean(
    (session.intake.intent === "service_request" || hasPendingConfirmation(session)) &&
    draftFingerprint(session.intake) !== draftFingerprint(sent)
  );
}
export function readyToSend(state, company) {
  return (
    state?.intent === "service_request" &&
    state.additionalServicesReviewed === true &&
        (state.pendingDetails?.length ?? 0) === 0 &&
    missingIntakeFields(state, company).length === 0
  );
}
export function presentRequestStep(
  reply,
  state,
  { showConfirmation = true, language = "cs", company } = {},
) {
  if (!showConfirmation || !readyToSend(state, company)) return reply;
  const t = messages(language),
    l = t.labels;
  const defaultParts =
    state.customerParts === true
      ? t.parts[0]
      : state.customerParts === false
        ? t.parts[1]
        : t.parts[2];
        const parts = describeParts(state, language, defaultParts);
  return [
    reply.trim() || null,
    reply.trim() ? "" : null,
    t.review,
    `${l[0]}: ${state.requestedWork || state.problem.description || state.serviceOptionId}`,
    `${l[1]}: ${state.vehicle.brand} ${state.vehicle.model}${state.vehicle.year ? ", " + state.vehicle.year : ""}`,
        state.vehicle.engine
      ? `${l[2]}: ${state.vehicle.engine}`
      : state.skipped.includes("vehicle.engine")
        ? `${l[2]}: ${
            {
              cs: "neuvedeno — servis upřesní",
              sk: "neuvedené — servis upresní",
              en: "not provided — service will clarify",
              ru: "не указан — сервис уточнит",
              uk: "не вказано — сервіс уточнить",
              de: "nicht angegeben — Werkstatt klärt dies",
            }[language] ?? "not provided — service will clarify"
          }`
        : null,
            state.vehicle.fuel
      ? `${
          {
            cs: "Druh paliva",
            sk: "Druh paliva",
            en: "Fuel type",
            ru: "Вид топлива",
            uk: "Вид палива",
            de: "Kraftstoffart",
          }[language] ?? "Fuel type"
        }: ${state.vehicle.fuel}`
      : null,
    state.vehicle.mileage ? `${l[3]}: ${state.vehicle.mileage}` : null,
    state.problem.description ? `${l[4]}: ${state.problem.description}` : null,
    `${l[5]}: ${parts}`,
    `${l[6]}: ${state.preferredTime}`,
    `${l[7]}: ${state.customer.name}`,
    state.customer.phone ? `${l[8]}: ${state.customer.phone}` : null,
    state.customer.email ? `${l[9]}: ${state.customer.email}` : null,
    "",
    t.send,
    t.unconfirmed,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
export async function handleSendConfirmation({
  session,
  confirmationToken,
  company,
  ip,
  sendRequest = sendServiceRequest,
}) {
  if (
    !confirmationMatches(session, confirmationToken) ||
    !readyToSend(session.intake, company) ||
    !readyToSend(session.confirmation?.intake, company)
  )
    return null;
  const intake = structuredClone(session.confirmation.intake),
    repo = session.repository,
    t = messages(session.language);
  if (["pending", "unknown"].includes(deliveryStatus(session))) {
    session.confirmation = null;
    return {
      status: 200,
      body: {
        reply: t.unknown,
        intake: { ...intake, intent: "service_discussion" },
        missingFields: [],
      },
    };
  }
  const id = createHash("sha256")
    .update(
      session.requestId +
        "\n" +
        session.confirmation.revision +
        "\n" +
        draftFingerprint(intake),
    )
    .digest("hex");
  let delivery = repo.delivery(id);
  if (delivery?.status === "sent") {
    session.lastDelivery = id;
    session.confirmation = null;
    return {
      status: 200,
      body: {
        reply: t.sent,
        intake: { ...intake, intent: "service_discussion" },
        missingFields: [],
      },
    };
  }
  if (delivery && delivery.status !== "failed") {
    session.lastDelivery = id;
    session.confirmation = null;
    return {
      status: 200,
      body: {
        reply: t.unknown,
        intake: { ...intake, intent: "service_discussion" },
        missingFields: [],
      },
    };
  }
  if (!repo.allow("send:" + ip, 5, 3600000))
    return { status: 429, body: { error: t.limit } };
  const reserved = delivery
    ? repo.retryFailed(id)
    : repo.reserve(id, session.id, intake);
  if (!reserved) return { status: 409, body: { error: t.busy } };
  session.lastDelivery = id;
  session.persist(); // Persist BEFORE contacting SMTP, including crash/timeout uncertainty.
  let deadline;
  const mailPromise = Promise.resolve().then(() =>
    sendRequest(intake, company, id),
  );
  // SMTP has no exactly-once delivery guarantee. Keep an uncertain journal entry
  // when its response is lost, and record a late positive acknowledgement.
  mailPromise
    .then(
      () => repo.finish(id, "sent"),
      () => {},
    )
    .catch(() => {});
  try {
    await Promise.race([
      mailPromise,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("Mail acknowledgement timed out")),
          25000,
        );
        deadline.unref();
      }),
    ]);
    repo.finish(id, "sent");
  } catch (error) {
    const definite =
      error.definiteFailure === true ||
      ["EAUTH", "EENVELOPE", "ECONNECTION", "EDNS"].includes(error.code) ||
      (error.responseCode >= 400 && error.responseCode <= 599);
    repo.finish(id, definite ? "failed" : "unknown");
    if (definite) return { status: 503, body: { error: t.failed } };
    session.confirmation = null;
    return {
      status: 200,
      body: {
        reply: t.unknown,
        intake: { ...intake, intent: "service_discussion" },
        missingFields: [],
      },
    };
  } finally {
    clearTimeout(deadline);
  }
  session.confirmation = null;
  return {
    status: 200,
    body: {
      reply: t.sent,
      intake: { ...intake, intent: "service_discussion" },
      missingFields: [],
    },
  };
}
