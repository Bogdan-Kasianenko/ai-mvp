import { randomUUID } from "node:crypto";
import { messages, clientMessages } from "./messages.mjs";
import { hasPendingConfirmation } from "./chat-session.mjs";

export function beginPendingChat(session, message, messageId) {
  const previous = Date.parse(session.history.at(-1)?.at ?? "");
  const at = Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0);
  const userMessage = {
    role: "user", content: message.trim(), id: messageId ?? randomUUID(),
    at: new Date(at).toISOString(),
  };
  session.history.push(userMessage);
  session.pendingRequest = { id: userMessage.id, startedAt: Date.now() };
  session.persist();
  return userMessage;
}

export function finishPendingChat(session, content) {
  if (!session.pendingRequest) return null;
  const previous = Date.parse(session.history.at(-1)?.at ?? "");
  const at = Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0);
  const assistantMessage = {
    role: "assistant", content, id: randomUUID(), at: new Date(at).toISOString(),
  };
  session.history.push(assistantMessage);
  session.pendingRequest = null;
  return assistantMessage;
}

export function failPendingChat(session, text = messages(session.language).unavailable) {
  if (!session.pendingRequest) return;
  finishPendingChat(session, text);
  session.persist();
}

export function chatSessionSnapshot(session) {
  return {
    restartGreeting: restartGreeting(session),
    conversationId: session.requestId,
    revision: session.revision,
    language: session.language,
    clientMessages: clientMessages(session.language),
    history: structuredClone(session.history),
    intake: structuredClone(session.intake),
    pendingRequest: session.pendingRequest
      ? { id: session.pendingRequest.id, startedAt: session.pendingRequest.startedAt }
      : null,
    confirmationToken: hasPendingConfirmation(session) ? session.confirmation.token : null,
  };
}

export function previousSentRequest(session, id = session.previousDelivery) {
  if (!id) return null;
  const delivery = session.repository.delivery(id);
  if (delivery?.status !== "sent" || delivery.session_id !== session.id) return null;
  return { deliveryId: id, intake: structuredClone(delivery.data) };
}

export function restartGreeting(session) {
  if (!session.restarted) return null;
  const text = {
    cs: ["Začínáme nový rozhovor. Napište mi, s čím Vám mohu pomoci.", "Chcete ještě něco doplnit k předchozí odeslané žádosti?"],
    sk: ["Začíname nový rozhovor. Napíšte mi, s čím Vám môžem pomôcť.", "Chcete ešte niečo doplniť k predchádzajúcej odoslanej žiadosti?"],
    en: ["This is a new chat. What can I help you with?", "Would you like to add anything to your previously sent request?"],
    de: ["Wir beginnen einen neuen Chat. Wobei kann ich Ihnen helfen?", "Möchten Sie Ihrer zuvor gesendeten Anfrage noch etwas hinzufügen?"],
    ru: ["Начинаем новый разговор. Напишите, чем я могу Вам помочь.", "Хотите что-нибудь добавить к предыдущей отправленной заявке?"],
    uk: ["Починаємо нову розмову. Напишіть, чим я можу Вам допомогти.", "Бажаєте щось додати до попередньої надісланої заявки?"],
  }[session.language] ?? ["Začínáme nový rozhovor. Napište mi, s čím Vám mohu pomoci.", "Chcete ještě něco doplnit k předchozí odeslané žádosti?"];
  return previousSentRequest(session) ? text.join(" ") : text[0];
}
