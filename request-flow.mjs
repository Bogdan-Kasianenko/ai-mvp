import { createHash, randomUUID } from "node:crypto";
import { hasValidContact, missingIntakeFields } from "./intake.mjs";
import { sendServiceRequest } from "./mailer.mjs";

const SEND_QUESTION = "Mám žádost odeslat servisu?";
const deliveries = new Map();
const attemptsByIp = new Map();

export function wasRequestSent(intake) {
  if (!intake || typeof intake !== "object") return false;

  const key = createHash("sha256")
    .update(JSON.stringify({ ...intake, intent: "service_request" }))
    .digest("hex");

  return deliveries.get(key)?.sent === true;
}

function readyToSend(state) {
  return state?.intent === "service_request" &&
    state.additionalServicesReviewed === true &&
    Boolean(state.requestedWork || state.serviceOptionId || state.problem?.description) &&
    Boolean(state.vehicle?.brand && state.vehicle?.model && state.vehicle?.year) &&
    Boolean(state.preferredTime && state.customer?.name) &&
    hasValidContact(state.customer);
}

function allowAttempt(ip) {
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) ?? []).filter(
    (time) => now - time < 60 * 60 * 1000
  );

  if (recent.length >= 5) return false;

  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

export function presentRequestStep(reply, state) {
  if (wasRequestSent(state)) {
  return reply.includes(SEND_QUESTION)
    ? "Žádost už byla odeslána na e-mail servisu. Termín zatím není potvrzen."
    : reply;
}
  if (readyToSend(state)) {
    return `Mám potřebné údaje k žádosti. ${SEND_QUESTION} Preferovaný termín pak potvrdí pracovník servisu.`;
  }

  if (state.intent !== "service_request" || reply.includes("?")) {
    return reply;
  }

  const questions = {
    serviceOrProblem: "Jakou opravu nebo problém mám uvést?",
    "vehicle.brand": "Jakou značku a model má Váš vůz?",
    "vehicle.model": "Jaký model vozu máte?",
    "vehicle.year": "Jaký je přibližně rok výroby vozu?",
    preferredTime: "Jaký termín by Vám vyhovoval?",
    "customer.name": "Jaké jméno mám uvést v žádosti?",
    "customer.contact":
      "Po Vašem potvrzení odešleme údaje e-mailem servisu. Jaký telefon nebo e-mail máme uvést?"
  };

  const field = missingIntakeFields(state)[0];
  return questions[field] ? `Děkuji. ${questions[field]}` : reply;
}

export async function handleSendConfirmation({
  history,
  intake,
  company,
  ip
}) {
  const lastAssistant = [...history]
    .reverse()
    .find((item) => item.role === "assistant")?.content ?? "";

  if (!lastAssistant.includes(SEND_QUESTION) || !readyToSend(intake)) {
    return null;
  }

  const key = createHash("sha256")
    .update(JSON.stringify(intake))
    .digest("hex");

  let delivery = deliveries.get(key);

  if (!delivery) {
    if (!allowAttempt(ip)) {
      return {
        status: 429,
        body: { error: "Příliš mnoho pokusů o odeslání. Zkuste to později." }
      };
    }

    delivery = {
      id: randomUUID(),
      promise: null
    };

    delivery.promise = sendServiceRequest(intake, company, delivery.id);
    deliveries.set(key, delivery);

    const timer = setTimeout(() => {
      if (deliveries.get(key) === delivery) deliveries.delete(key);
    }, 24 * 60 * 60 * 1000);
    timer.unref();
  }

  try {
    await delivery.promise;
    delivery.sent = true;
  } catch (error) {
    if (deliveries.get(key) === delivery) deliveries.delete(key);
    console.error("Email delivery failed:", error.message);

    return {
      status: 503,
      body: {
        error: "Žádost se nepodařilo odeslat. Zkuste to prosím znovu."
      }
    };
  }

  const nextIntake = { ...intake, intent: "service_discussion" };

  return {
    status: 200,
    body: {
      reply: "Žádost byla odeslána na e-mail servisu. Termín zatím není potvrzen; pracovník se Vám ozve.",      intake: nextIntake,
      missingFields: []
    }
  };
}
