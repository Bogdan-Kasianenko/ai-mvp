const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const messages = document.querySelector("#messages");

const chatPanel = document.querySelector("#chat-panel");
const chatOpen = document.querySelector("#chat-open");
const chatClose = document.querySelector("#chat-close");
const chatPrompt = document.querySelector("#chat-prompt");
const chatHint = document.querySelector("#chat-launcher-hint");
const launcherTyping = document.querySelector("#chat-launcher-typing");
const chatOpenText = document.querySelector("#chat-open-text");
const unreadBadge = document.querySelector("#chat-unread");
const unreadStatus = document.querySelector("#chat-unread-status");
const newMessagesButton = document.querySelector("#chat-new-messages");
const newMessagesText = document.querySelector("#chat-new-messages-text");
const newMessagesDots = newMessagesButton.querySelector(
  ".chat-new-messages__dots",
);
const chatSuggestions = document.querySelector("#chat-suggestions");
const questionListToggle = document.querySelector("#question-list-toggle");
const questionList = document.querySelector("#question-list");
const chatQuickActions = document.querySelector("#chat-quick-actions");
const chatHelpButton = document.querySelector("#chat-help");

const CHAT_SCROLL_KEY = "autoservice-chat-scroll-v1";
let scrollConversationId = null;
let restoringChatScroll = false;
let scrollInteractionVersion = 0;
let scrollRestoreVersion = 0;

function readChatScroll(conversation = null) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHAT_SCROLL_KEY) || "null");
    if (!saved || (conversation && saved.conversationId !== conversation)) return null;
    const value = saved.position;
    if (!value || !Number.isFinite(value.top) || value.top < 0 ||
        typeof value.atBottom !== "boolean") return null;
    return value;
  } catch { return null; }
}

function captureChatScroll() {
  if (chatPanel.hidden || !messages.clientHeight) return null;
  const rows = [...messages.querySelectorAll(".chat-message[data-history-id]")];
  const anchor = rows.find(row => row.offsetTop + row.offsetHeight > messages.scrollTop);
  return {
    top: messages.scrollTop,
    atBottom: messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 2,
    anchorId: anchor?.dataset.historyId ?? null,
    offset: anchor ? anchor.offsetTop - messages.scrollTop : 0,
  };
}

function saveChatScroll() {
  if (!scrollConversationId || restoringChatScroll) return;
  const position = captureChatScroll();
  if (!position) return;
  try {
    sessionStorage.setItem(CHAT_SCROLL_KEY, JSON.stringify({
      conversationId: scrollConversationId, position,
    }));
  } catch {}
}

function restoreChatScroll(position) {
  if (chatPanel.hidden) return;
  restoringChatScroll = true;
  const rows = [...messages.querySelectorAll(".chat-message[data-history-id]")];
  const anchor = position?.anchorId
    ? rows.find(row => row.dataset.historyId === position.anchorId) : null;
  const top = !position || position.atBottom
    ? messages.scrollHeight
    : anchor && Number.isFinite(position.offset)
      ? anchor.offsetTop - position.offset : position.top;
  messages.scrollTo({ top, behavior: "instant" });
  syncUnreadCount();
  requestAnimationFrame(() => {
    restoringChatScroll = false;
    saveChatScroll();
  });
}

function restoreServerChatScroll(conversation, previousPosition) {
  const position = previousPosition || readChatScroll(conversation);
  scrollConversationId = conversation;
  restoreChatScroll(position);
  // Font loading may change the height of the same message after first layout.
  const version = scrollInteractionVersion;
  const restoreVersion = ++scrollRestoreVersion;
  document.fonts?.ready.then(() => {
    if (restoreVersion === scrollRestoreVersion && version === scrollInteractionVersion && scrollConversationId === conversation) {
      restoreChatScroll(position);
    }
  });
}

messages.addEventListener("scroll", saveChatScroll, { passive: true });
for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  messages.addEventListener(event, () => { scrollInteractionVersion++; }, { passive: true });
}
window.addEventListener("pagehide", saveChatScroll);
form.addEventListener("submit", () => { scrollInteractionVersion++; });
newMessagesButton.addEventListener("click", () => { scrollInteractionVersion++; });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveChatScroll();
});


const requestReviewTitles = new Set([
  "Zkontrolujte prosím žádost:", "Skontrolujte prosím žiadosť:",
  "Please review your request:", "Проверьте, пожалуйста, заявку:",
  "Перевірте, будь ласка, заявку:", "Bitte prüfen Sie Ihre Anfrage:",
]);

function appendRequestCard(container, lines, start) {
  if (!requestReviewTitles.has(lines[start].trim())) return start;
  const fields = [];
  let end = start + 1;
  while (end < lines.length) {
    const match = /^([^:]{1,60}):\s*(.+)$/.exec(lines[end].trim());
    if (!match) break;
    fields.push([match[1], match[2]]);
    end++;
  }
  if (fields.length < 2) return start;
  const card = document.createElement("section");
  card.className = "chat-request-card";
  const title = document.createElement("div");
  title.className = "chat-request-card__title";
  title.textContent = lines[start].trim().replace(/:$/, "");
  card.append(title);
  const details = document.createElement("dl");
  for (const [label, value] of fields) {
    const field = document.createElement("div");
    field.className = "chat-request-card__field";
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    field.append(term, description);
    details.append(field);
  }
  card.append(details);
  container.append(card);
  return end;
}


const CHAT_OPENED_KEY = "autoservice-chat-opened-v2";
let isFirstVisit = false;
try {
  isFirstVisit = localStorage.getItem(CHAT_OPENED_KEY) !== "1";
} catch {
  // Если хранилище недоступно, показываем обычную кнопку.
}

const CHAT_UI_KEY = "autoservice-chat-ui-v1";
const CHAT_OPEN_KEY = "autoservice-chat-open-v1";
const CHAT_EXPANDED_KEY = "autoservice-chat-expanded-v1";
const chatUiState = { open: false, expanded: false };
let oldChatUiState = null;

try {
  oldChatUiState = JSON.parse(localStorage.getItem(CHAT_UI_KEY) || "null");
} catch {
  // Повреждённая старая настройка не мешает читать новые настройки.
}

try {
  const savedOpen = sessionStorage.getItem(CHAT_OPEN_KEY);
  if (savedOpen !== null) {
    chatUiState.open = savedOpen === "true";
  } else if (typeof oldChatUiState?.open === "boolean") {
    chatUiState.open = oldChatUiState.open;
    sessionStorage.setItem(CHAT_OPEN_KEY, String(chatUiState.open));
  }
} catch {
  // Если хранилище вкладки недоступно, чат начнёт с закрытого состояния.
}

try {
  const savedExpanded = localStorage.getItem(CHAT_EXPANDED_KEY);
  if (savedExpanded !== null) {
    chatUiState.expanded = savedExpanded === "true";
  } else if (typeof oldChatUiState?.expanded === "boolean") {
    chatUiState.expanded = oldChatUiState.expanded;
    localStorage.setItem(CHAT_EXPANDED_KEY, String(chatUiState.expanded));
  }
  if (sessionStorage.getItem(CHAT_OPEN_KEY) !== null) {
    localStorage.removeItem(CHAT_UI_KEY);
  }
} catch {
  // Чат продолжит работать, даже если браузер запретил сохранение.
}

function saveChatOpenState() {
  try {
    sessionStorage.setItem(CHAT_OPEN_KEY, String(chatUiState.open));
  } catch {
    // Чат продолжит работать, даже если браузер запретил сохранение.
  }
}

function saveChatExpandedState() {
  try {
    localStorage.setItem(CHAT_EXPANDED_KEY, String(chatUiState.expanded));
  } catch {
    // Чат продолжит работать, даже если браузер запретил сохранение.
  }
}

let isAiTyping = false;
let unreadCount = 0;

chatPrompt.classList.toggle("is-first-visit", isFirstVisit);
chatHint.hidden = !isFirstVisit;
chatOpenText.textContent = isFirstVisit
  ? "Zeptat se asistenta"
  : "Váš AI asistent";

function updateLauncherStatus() {
  launcherTyping.hidden = !chatPanel.hidden || !isAiTyping;
  unreadBadge.hidden = unreadCount === 0;
  unreadBadge.textContent = String(unreadCount);

  const unreadLabel =
    unreadCount === 1
      ? "1 nepřečtená zpráva"
      : unreadCount < 5
        ? `${unreadCount} nepřečtené zprávy`
        : `${unreadCount} nepřečtených zpráv`;
  const buttonLabel = chatOpenText.textContent.trim();
  chatOpen.setAttribute(
    "aria-label",
    unreadCount > 0 ? `${buttonLabel}. ${unreadLabel}` : buttonLabel,
  );

  const announcement =
    unreadCount > 0 && (chatPanel.hidden || !isNearMessagesBottom())
      ? `AI asistent: ${unreadLabel}.`
      : "";
  if (unreadStatus.textContent !== announcement) {
    unreadStatus.textContent = announcement;
  }
  updateInChatNotice();
}

function isNearMessagesBottom() {
  return (
    messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96
  );
}

function updateInChatNotice() {
  const showNotice =
    chatUiState.open && !chatPanel.hidden && !isNearMessagesBottom();
  const showUnread = showNotice && unreadCount > 0;
  const showTyping = showNotice && !showUnread && isAiTyping;

  newMessagesButton.hidden = !showUnread && !showTyping;
  newMessagesDots.hidden = !showTyping;
  if (showUnread) {
    newMessagesText.textContent =
      unreadCount === 1
        ? "1 nepřečtená zpráva"
        : unreadCount < 5
          ? `${unreadCount} nepřečtené zprávy`
          : `${unreadCount} nepřečtených zpráv`;
  } else if (showTyping) {
    newMessagesText.textContent = "AI asistent píše…";
  }
}

const CHAT_HISTORY_KEY = "autoservice-chat-history-v1";
const CHAT_MESSAGE_PREFIX = "autoservice-chat-message-v1:";
const PENDING_CHAT_MESSAGE_KEY = "autoservice-chat-pending-v1";
const CHAT_LAST_READ_KEY = "autoservice-chat-last-read-v1";
const CHAT_RESET_KEY = "autoservice-chat-reset-v1";
const CHAT_INTAKE_KEY = "autoservice-chat-intake-v1";
const CHAT_HISTORY_LIFETIME = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 20000;
const TRUNCATION_NOTICE = "\n\n[Zpráva byla zkrácena.]";
let chatHistory = [];
let intakeState = null;
let confirmationToken = null;
let conversationId = null;
let sessionRevision = null;
let sessionSync = null;
let resetRequired = false;
let sessionInitialized = false;
let activeChatPost = false;
let recoveredTypingRow = null;
let recoveredRequestId = null;
let recoveryPollTimer = null;
let serverHistoryTailId = null;
const PENDING_CHAT_CONTEXT_KEY = "autoservice-chat-pending-context-v1";

function readUnacknowledgedMessage(data) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_CHAT_CONTEXT_KEY) || "null");
    if (!saved || saved.conversationId !== data.conversationId ||
        !isValidHistoryEntry(saved.entry) || saved.entry.role !== "user" ||
        saved.entry.id !== sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY) ||
        Date.now() - Date.parse(saved.entry.at) >= CHAT_HISTORY_LIFETIME ||
        data.history.some(entry => entry.id === saved.entry.id) ||
        data.pendingRequest?.id === saved.entry.id) return null;
    return saved.entry;
  } catch { return null; }
}

function clearRecoveredRequest() {
  clearTimeout(recoveryPollTimer);
  recoveryPollTimer = null;
  recoveredTypingRow?.remove();
  recoveredTypingRow = null;
  recoveredRequestId = null;
}

function scheduleRecoveryPoll() {
  clearTimeout(recoveryPollTimer);
  recoveryPollTimer = setTimeout(async () => {
    recoveryPollTimer = null;
    try { await syncServerSession(); }
    catch {
      // Reconnect by reading status; never repeat the original POST.
      if (recoveredRequestId) scheduleRecoveryPoll();
    }
  }, document.visibilityState === "hidden" ? 3000 : 1000);
}

function shouldAnimateRecoveredSend(data) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_CHAT_CONTEXT_KEY) || "null");
    return saved?.conversationId === data.conversationId &&
      saved?.entry?.id === data.pendingRequest?.id && saved?.animateSend === true;
  } catch { return false; }
}

function recoverPendingRequest(data) {
  if (activeChatPost) return;
  const pending = data.pendingRequest;
  if (pending) {
    recoveredRequestId = pending.id;
    isAiTyping = true;
    sendButton.disabled = true;
    sendButton.classList.toggle("is-sending", shouldAnimateRecoveredSend(data));
    if (!recoveredTypingRow?.isConnected) recoveredTypingRow = showTypingMessage();
    updateLauncherStatus();
    updateSuggestions();
    scheduleRecoveryPoll();
    return;
  }
  const wasRecovering = Boolean(recoveredRequestId);
  clearRecoveredRequest();
  try {
    const pendingId = sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY);
    if (pendingId && data.history.some(entry => entry.id === pendingId)) {
      sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);
      sessionStorage.removeItem(PENDING_CHAT_CONTEXT_KEY);
    }
  } catch {}
  if (wasRecovering) {
    isAiTyping = false;
    sendButton.disabled = false;
    sendButton.classList.remove("is-sending");
    updateLauncherStatus();
    updateSuggestions();
    if (chatUiState.open && !chatPanel.hidden) input.focus({ preventScroll: true });
  }
}

let welcomeTask = null;
let chatRestartGreeting = null;
let uiMessages = {
  invalidMessage: 'Zadejte zprávu o délce 1 až 1000 znaků.',
  timeout: 'Odpověď trvá příliš dlouho. Zkuste to prosím znovu.',
  requestFailed: 'Požadavek se nepodařilo zpracovat. Zkuste to prosím znovu.',
  connectionFailed: 'Nepodařilo se připojit k serveru. Zkuste to prosím později.',
  unreadableReply: 'Odpověď se nepodařilo načíst. Zkuste to prosím znovu.',
  restoreFailed: 'Nepodařilo se obnovit rozhovor. Zkuste to znovu.',
  interrupted: 'Odpověď byla přerušena obnovením stránky. Odešlete zprávu prosím znovu.',
  unavailable: 'AI asistent nyní nemůže odpovědět. Zkuste to prosím později.',
};
function receiveClientMessages(data) {
  for(const key of Object.keys(uiMessages)) {
    if(typeof data?.clientMessages?.[key] === 'string') uiMessages[key]=data.clientMessages[key];
  }
  try { sessionStorage.setItem('caro-ui-messages',JSON.stringify(uiMessages)); } catch {}
}
try { receiveClientMessages({clientMessages:JSON.parse(sessionStorage.getItem('caro-ui-messages') || 'null')}); } catch {}
let lastReadMarker = null;
let chatGeneration = 0;
let historyExpiryTimer;
let questionListOpen = false;
let helpHintTimer;
let helpHintDismissed = false;
let helpHoverStartedAt = null;

function limitMessageLength(content) {
  if (content.length <= MAX_MESSAGE_LENGTH) return content;

  let end = MAX_MESSAGE_LENGTH - TRUNCATION_NOTICE.length;
  const lastCode = content.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
  return content.slice(0, end) + TRUNCATION_NOTICE;
}

function isValidHistoryEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    ["user", "assistant", "error", "welcome"].includes(entry.role) &&
    typeof entry.content === "string" &&
    entry.content.trim().length > 0 &&
    typeof entry.at === "string" &&
    !Number.isNaN(Date.parse(entry.at))
  );
}

function normalizeHistoryEntry(entry) {
  return isValidHistoryEntry(entry)
    ? {
        id: entry.id,
        role: entry.role,
        content: limitMessageLength(entry.content),
        at: entry.at,
      }
    : null;
}

function compareHistoryEntries(a, b) {
  return Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id);
}

function readStoredLastReadMarker() {
  try {
    const marker = JSON.parse(
      localStorage.getItem(CHAT_LAST_READ_KEY) || "null",
    );
    return marker &&
      typeof marker.id === "string" &&
      typeof marker.at === "string" &&
      !Number.isNaN(Date.parse(marker.at))
      ? marker
      : null;
  } catch {
    return null;
  }
}

function updateUnreadCount() {
  unreadCount = chatHistory.filter(
    (entry) =>
      ["assistant", "error", "welcome"].includes(entry.role) &&
      (!lastReadMarker || compareHistoryEntries(entry, lastReadMarker) > 0),
  ).length;
  updateLauncherStatus();
}

function markMessagesRead() {
  const storedMarker = readStoredLastReadMarker();
  let newest = lastReadMarker;
  if (
    storedMarker &&
    (!newest || compareHistoryEntries(storedMarker, newest) > 0)
  ) {
    newest = storedMarker;
  }

  const latestMessage = chatHistory.at(-1);
  if (
    latestMessage &&
    (!newest || compareHistoryEntries(latestMessage, newest) > 0)
  ) {
    newest = { id: latestMessage.id, at: latestMessage.at };
  }

  lastReadMarker = newest;
  if (
    newest &&
    (!storedMarker || compareHistoryEntries(newest, storedMarker) > 0)
  ) {
    try {
      localStorage.setItem(CHAT_LAST_READ_KEY, JSON.stringify(newest));
    } catch {
      // Bez úložiště zůstane stav přečtení jen v této kartě.
    }
  }
  updateUnreadCount();
}

function syncUnreadCount() {
  if (
    chatUiState.open &&
    !chatPanel.hidden &&
    document.visibilityState === "visible" &&
    isNearMessagesBottom()
  )
    markMessagesRead();
  else updateUnreadCount();
}

function readStoredHistory() {
  const entries = new Map();

  try {
    const oldHistory = JSON.parse(
      localStorage.getItem(CHAT_HISTORY_KEY) || "null",
    );
    if (Array.isArray(oldHistory)) {
      oldHistory.forEach((entry, index) => {
        const migrated = normalizeHistoryEntry({
          ...entry,
          id: `legacy-${index}-${entry?.at}`,
        });
        if (migrated) entries.set(migrated.id, migrated);
      });
    }
  } catch {
    // Повреждённый старый ключ не мешает читать новые сообщения.
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CHAT_MESSAGE_PREFIX)) continue;

      try {
        const entry = normalizeHistoryEntry(
          JSON.parse(localStorage.getItem(key)),
        );
        if (entry && key === CHAT_MESSAGE_PREFIX + entry.id) {
          entries.set(entry.id, entry);
        }
      } catch {
        // Повреждённая запись не мешает читать остальные сообщения.
      }
    }
  } catch {
    // Если хранилище недоступно, остаётся история текущей вкладки.
  }

  return [...entries.values()].sort(compareHistoryEntries);
}

function migrateOldHistory() {
  try {
    const oldHistory = JSON.parse(
      localStorage.getItem(CHAT_HISTORY_KEY) || "null",
    );
    if (!Array.isArray(oldHistory)) return;

    oldHistory.forEach((entry, index) => {
      const migrated = normalizeHistoryEntry({
        ...entry,
        id: `legacy-${index}-${entry?.at}`,
      });
      if (!migrated) return;
      localStorage.setItem(
        CHAT_MESSAGE_PREFIX + migrated.id,
        JSON.stringify(migrated),
      );
    });
    localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch {
    // Старый ключ остаётся на месте, если перенос не удался.
  }
}

function pruneStoredHistory() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CHAT_MESSAGE_PREFIX)) keys.push(key);
    }

    const newest = new Set(
      readStoredHistory().map((entry) => CHAT_MESSAGE_PREFIX + entry.id),
    );
    for (const key of keys) {
      if (!newest.has(key)) localStorage.removeItem(key);
    }
  } catch {
    // Ошибка очистки не должна прерывать чат.
  }
}

function resetChatLocally({ resetServer = true } = {}) {
  clearRecoveredRequest();
  activeChatPost = false;
  serverHistoryTailId = null;
  scrollConversationId = null;
  scrollRestoreVersion++;
  try { sessionStorage.removeItem(CHAT_SCROLL_KEY); } catch {}

  confirmationToken = null;
  chatRestartGreeting = null;
  conversationId = null;
  resetRequired = resetServer;
  sessionInitialized = false;
  chatGeneration++;
  clearTimeout(historyExpiryTimer);
  chatHistory = [];
  intakeState = null;
  lastReadMarker = null;
  isFirstVisit = true;
  chatPrompt.classList.add("is-first-visit");
  chatHint.hidden = false;
  chatOpenText.textContent = "Zeptat se asistenta";
  messages.replaceChildren();
  isAiTyping = false;
  sendButton.disabled = false;
  sendButton.classList.remove("is-sending");
  try {
    sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);
    sessionStorage.removeItem(PENDING_CHAT_CONTEXT_KEY);
    localStorage.removeItem(CHAT_INTAKE_KEY);
  } catch {
    // Чат работает и без хранилища вкладки.
  }
  updateUnreadCount();
  updateSuggestions();
  void syncServerSession().catch(() => {});
}

function scheduleHistoryExpiry() {
  clearTimeout(historyExpiryTimer);
  const latest = chatHistory.at(-1);
  if (!latest) return;
  const remaining = Date.parse(latest.at) + CHAT_HISTORY_LIFETIME - Date.now();
  historyExpiryTimer = setTimeout(
    () => expireChatHistoryIfNeeded(),
    Math.min(2_147_483_647, Math.max(0, remaining + 50)),
  );
}

function expireChatHistoryIfNeeded(showWelcome = true) {
  const stored = readStoredHistory();
  const latest = [stored.at(-1), chatHistory.at(-1)]
    .filter(Boolean)
    .sort(compareHistoryEntries)
    .at(-1);
  if (!latest || Date.now() - Date.parse(latest.at) < CHAT_HISTORY_LIFETIME) {
    scheduleHistoryExpiry();
    return false;
  }

  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CHAT_MESSAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    localStorage.removeItem(CHAT_LAST_READ_KEY);
    localStorage.removeItem(CHAT_OPENED_KEY);
    localStorage.removeItem(CHAT_INTAKE_KEY);
    localStorage.setItem(CHAT_RESET_KEY, makeMessageId());
  } catch {
    // Даже без доступа к хранилищу устаревший разговор исчезнет в этой вкладке.
  }

  resetChatLocally();
  if (showWelcome && chatUiState.open && !chatPanel.hidden)
    showWelcomeMessage();
  return true;
}

function makeMessageId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function rememberMessage(
  role,
  content,
  at = new Date().toISOString(),
  id = makeMessageId(),
) {
  const entry = { id, role, content: limitMessageLength(content), at };
  if (chatHistory.some((message) => message.id === id)) return entry;

  chatHistory.push(entry);
  chatHistory.sort(compareHistoryEntries);

  try {
    localStorage.setItem(CHAT_MESSAGE_PREFIX + id, JSON.stringify(entry));
    pruneStoredHistory();
  } catch {
    // Чат продолжит работать, даже если браузер запретил сохранение.
  }

  syncUnreadCount();
  scheduleHistoryExpiry();
  updateSuggestions();
  return entry;
}

function refreshChatHistory() {
  if (isAiTyping) return;
  if (expireChatHistoryIfNeeded()) return;
  const wasNearBottom = isNearMessagesBottom();
  const knownIds = new Set(chatHistory.map((entry) => entry.id));
  const newEntries = readStoredHistory().filter(
    (entry) => !knownIds.has(entry.id),
  );

  for (const entry of newEntries) {
    const author = entry.role === "user" ? "Vy" : "AI asistent";
    const row = showMessage(author, entry.content, entry.at, true);
    placeHistoryRow(row, entry);
  }

  chatHistory.push(...newEntries);
  chatHistory.sort(compareHistoryEntries);
  if (
    newEntries.length &&
    wasNearBottom &&
    chatUiState.open &&
    !chatPanel.hidden
  ) {
    requestAnimationFrame(scrollMessagesToBottom);
  }
  syncUnreadCount();
  scheduleHistoryExpiry();
  updateSuggestions();
}

migrateOldHistory();
expireChatHistoryIfNeeded();
chatHistory = readStoredHistory();
try {
  if (chatHistory.some((entry) => entry.role === "user")) {
    intakeState = JSON.parse(localStorage.getItem(CHAT_INTAKE_KEY) || "null");
  }
} catch {
  intakeState = null;
}
pruneStoredHistory();
scheduleHistoryExpiry();
lastReadMarker = readStoredLastReadMarker();
updateUnreadCount();


window.addEventListener("storage", (event) => {
  if (event.key === CHAT_RESET_KEY) {
    resetChatLocally({ resetServer: false });
    if (chatUiState.open && !chatPanel.hidden) showWelcomeMessage();
    return;
  }
  if (event.key?.startsWith(CHAT_MESSAGE_PREFIX) && event.newValue !== null) {
    refreshChatHistory();
  }
  if (event.key === CHAT_LAST_READ_KEY) {
    const marker = readStoredLastReadMarker();
    if (
      marker &&
      (!lastReadMarker || compareHistoryEntries(marker, lastReadMarker) > 0)
    ) {
      lastReadMarker = marker;
      syncUnreadCount();
    }
  }
  if (event.key === CHAT_INTAKE_KEY) {
    try {
      intakeState = JSON.parse(event.newValue || "null");
    } catch {
      intakeState = null;
    }
  }
});

async function syncServerSession() {
  if (sessionSync) return sessionSync;
  sessionSync = (async () => {
    const reset = resetRequired;
    let response;
    try { response = await fetch(
      reset ? "/api/session/reset" : "/api/session",
      {
        method: reset ? "POST" : "GET",
        signal: AbortSignal.timeout(10000),
      },
    ); } catch { throw new Error(uiMessages.connectionFailed); }
    let data;
    try { data = await response.json(); } catch { throw new Error(uiMessages.unreadableReply); }
    receiveClientMessages(data);
    if (!response.ok)
      throw new Error(
        data.error || uiMessages.restoreFailed,
      );
    if (reset) resetRequired = false;
    chatRestartGreeting = typeof data.restartGreeting === "string" ? data.restartGreeting : null;
        if (
      !sessionInitialized ||
      serverHistoryTailId !== (data.history.at(-1)?.id ?? null) ||
      conversationId !== data.conversationId ||
      sessionRevision !== data.revision ||
      confirmationToken !== (data.confirmationToken ?? null)
    ) {
      const previousScroll = sessionInitialized && conversationId === data.conversationId
        ? captureChatScroll() : readChatScroll(data.conversationId);
      restoringChatScroll = true;
      const unacknowledged = readUnacknowledgedMessage(data);
      // Restore the server-owned conversation; local history is display-only.
      chatHistory = [];
      messages.replaceChildren();
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(CHAT_MESSAGE_PREFIX)) keys.push(key);
        }
        for (const key of keys) localStorage.removeItem(key);
      } catch {}
            // Восстанавливаем приветствие перед существующей перепиской.
      if (data.history.length > 0 || unacknowledged) {
        const welcomeText =
          chatRestartGreeting ?? "Dobrý den! 👋 S čím vám mohu pomoci? Napište mi, co se děje s vaším autem, nebo se zeptejte na služby, ceny či možnosti online objednání do servisu.";

        const firstTime = Date.parse(data.history[0]?.at ?? unacknowledged?.at);
        const welcomeAt = new Date(
          Number.isFinite(firstTime) ? firstTime - 1 : Date.now() - 1,
        ).toISOString();

        const welcomeEntry = rememberMessage(
          "welcome",
          welcomeText,
          welcomeAt,
          "welcome",
        );

        const welcomeRow = showMessage(
          "AI asistent",
          welcomeText,
          welcomeAt,
          true,
        );

        placeHistoryRow(welcomeRow, welcomeEntry);
      }
      for (const entry of data.history) {
        if (!["user", "assistant"].includes(entry.role)) continue;
        const saved = rememberMessage(
          entry.role,
          entry.content,
          entry.at || new Date().toISOString(),
          entry.id,
        );
        const row = showMessage(
          entry.role === "user" ? "Vy" : "AI asistent",
          entry.content,
          saved.at,
          true,
        );
        placeHistoryRow(row, saved);
      }
      if (unacknowledged) {
        const saved = rememberMessage("user", unacknowledged.content, unacknowledged.at, unacknowledged.id);
        placeHistoryRow(showMessage("Vy", saved.content, saved.at, true), saved);
        const failed = rememberMessage("error", uiMessages.connectionFailed,
          new Date(Date.parse(saved.at) + 1).toISOString(), "not-received-" + saved.id);
        placeHistoryRow(showMessage("AI asistent", failed.content, failed.at, true), failed);
      }
      if (!chatHistory.length && chatUiState.open && !chatPanel.hidden)
        showWelcomeMessage();
      const firstRestore = !sessionInitialized;
sessionInitialized = true;

requestAnimationFrame(() => {
  scrollConversationId = data.conversationId;
  if (!chatUiState.open || chatPanel.hidden) {
    restoringChatScroll = false;
    return;
  }

  restoreServerChatScroll(data.conversationId, previousScroll);

  if (!firstRestore || chatMotionReduced.matches) return;

  const recentRows = [
    ...messages.querySelectorAll(".chat-message"),
  ].filter(row => row.offsetTop + row.offsetHeight > messages.scrollTop &&
    row.offsetTop < messages.scrollTop + messages.clientHeight).slice(0, 5);

  recentRows.forEach((row, index) => {
    row.animate(
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 340,
        delay: index * 45,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "backwards",
      },
    );
  });
});
    }
        conversationId = data.conversationId;
    sessionRevision = data.revision;
    confirmationToken = data.confirmationToken ?? null;
    intakeState = data.intake;
    serverHistoryTailId = data.history.at(-1)?.id ?? null;
    recoverPendingRequest(data);
    return data;
  })();
  try {
    return await sessionSync;
  } finally {
    sessionSync = null;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && questionListOpen) {
    setQuestionListOpen(false);
    chatHelpButton.focus();
  }
});

function resizeMessageInput() {
  input.style.height = "24px";

  const neededHeight = input.scrollHeight;
  input.style.height = `${Math.min(neededHeight, 72)}px`;
  input.style.overflowY = neededHeight > 72 ? "auto" : "hidden";
}

function hideHelpHint() {
  clearTimeout(helpHintTimer);
  chatHelpButton.classList.remove("show-hint");
}

function scheduleHelpHint() {
  hideHelpHint();
  if (helpHintDismissed || chatHistory.some((entry) => entry.role === "user"))
    return;

  helpHintTimer = setTimeout(() => {
    if (
      chatPanel.hidden ||
      questionListOpen ||
      chatHelpButton.disabled ||
      chatHistory.some((entry) => entry.role === "user")
    )
      return;

    chatHelpButton.classList.add("show-hint");
  }, 5000);
}

function setQuestionListOpen(open) {
  if (open) {
    helpHintDismissed = true;
    hideHelpHint();
  }
  questionListOpen = open;
  questionList.classList.toggle("is-open", open);
  questionList.inert = !open;
  questionListToggle.setAttribute("aria-expanded", String(open));
  chatHelpButton.setAttribute("aria-expanded", String(open));
}

questionList.hidden = false;
setQuestionListOpen(false);

function updateSuggestions() {
  if (questionList.parentElement !== chatQuickActions) {
    setQuestionListOpen(false);
    chatQuickActions.append(questionList);
  }

  chatSuggestions.hidden = true;
  chatQuickActions.hidden = false;
  chatHelpButton.hidden = false;
  chatHelpButton.disabled = sendButton.disabled;

  if (sendButton.disabled) setQuestionListOpen(false);
}

questionListToggle.addEventListener("click", () => {
  setQuestionListOpen(!questionListOpen);
});

chatHelpButton.addEventListener("click", () => {
  setQuestionListOpen(!questionListOpen);
});

chatHelpButton.addEventListener("mouseenter", () => {
  helpHoverStartedAt = performance.now();
});

chatHelpButton.addEventListener("mouseleave", () => {
  if (
    helpHoverStartedAt !== null &&
    performance.now() - helpHoverStartedAt >= 1000
  ) {
    helpHintDismissed = true;
    hideHelpHint();
  }

  helpHoverStartedAt = null;
});

questionList.addEventListener("click", (event) => {
  const question = event.target.closest("button[data-question]")?.dataset
    .question;
  if (!question || sendButton.disabled) return;

  setQuestionListOpen(false);
  input.value = question;
  resizeMessageInput();
  form.requestSubmit(sendButton);
});

document.addEventListener("click", (event) => {
  // Клик по кнопке открытия чата должен запустить таймер подсказки.
  if (chatHelpButton.classList.contains("show-hint")) {
    helpHintDismissed = true;
    hideHelpHint();
  }

  if (
    !questionListOpen ||
    questionListToggle.contains(event.target) ||
    chatHelpButton.contains(event.target) ||
    questionList.contains(event.target)
  )
    return;

  setQuestionListOpen(false);
});

input.addEventListener("input", resizeMessageInput);

function animateManualSend() {
  const message = input.value.trim();
  if (!sendButton.disabled && message && message.length <= 1000) {
    sendButton.classList.add("is-sending");
  }
}

sendButton.addEventListener("click", animateManualSend);

input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

  event.preventDefault();

  if (!sendButton.disabled) {
    const message = input.value.trim();

    if (message && message.length <= 1000) {
      input.blur();
    }

    animateManualSend();
    form.requestSubmit(sendButton);
  }
});

const chatMotionReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let chatIsClosing = false;

chatOpen.addEventListener("click", () => {
  expireChatHistoryIfNeeded(false);
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
  chatUiState.open = true;
  isFirstVisit = false;
  try {
    localStorage.setItem(CHAT_OPENED_KEY, "1");
  } catch {
    // Чат работает и без этой отметки.
  }
  saveChatOpenState();
  chatPrompt.classList.remove("is-first-visit");
  chatHint.hidden = true;
  chatOpenText.textContent = "Váš AI asistent";
  markMessagesRead();

  const hadMessages = messages.querySelector(".chat-message") !== null;
  showWelcomeMessage();
  updateSuggestions();
  scheduleHelpHint();

  if (!chatMotionReduced.matches) {
    chatPanel.animate(
      [
        { opacity: 0, transform: "translateY(20px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)" },
    );
  }

  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;

    if (!hadMessages || chatMotionReduced.matches) return;

    const recentRows = [...messages.querySelectorAll(".chat-message")].slice(
      -5,
    );

    recentRows.forEach((row, index) => {
      row.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 340,
          delay: index * 45,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "backwards",
        },
      );
    });
  });
});

const chatExpand = document.querySelector("#chat-expand");

chatClose.addEventListener("click", async () => {
  if (chatIsClosing) return;
  chatIsClosing = true;
  hideHelpHint();
  setQuestionListOpen(false);
  chatUiState.open = false;
  saveChatOpenState();

  if (!chatMotionReduced.matches) {
    const animation = chatPanel.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(18px)" },
      ],
      { duration: 190, easing: "ease-in", fill: "forwards" },
    );

    await animation.finished;
    chatPanel.hidden = true;
    animation.cancel();
  } else {
    chatPanel.hidden = true;
  }

  chatPrompt.classList.add("is-returning");
  chatPrompt.hidden = false;
  updateLauncherStatus();
  chatOpen.focus();
  chatIsClosing = false;
});

function setChatExpanded(expanded) {
  chatPanel.classList.toggle("is-expanded", expanded);
  chatExpand.setAttribute(
    "aria-label",
    expanded ? "Zmenšit chat" : "Zvětšit chat",
  );

  chatExpand
    .querySelector("path")
    .setAttribute(
      "d",
      expanded
        ? "M5 5l8 8m0-7v7H6M25 25l-8-8m0 7v-7h7"
        : "M13 13 5 5M5 12V5h7M17 17l8 8m-7 0h7v-7",
    );
}

chatExpand.addEventListener("click", () => {
  const expanded = !chatPanel.classList.contains("is-expanded");
  setChatExpanded(expanded);
  chatUiState.expanded = expanded;
  saveChatExpandedState();
});

window.addEventListener("storage", (event) => {
  if (event.key !== CHAT_EXPANDED_KEY) return;
  chatUiState.expanded = event.newValue === "true";
  setChatExpanded(chatUiState.expanded);
});

function scrollMessagesToBottom() {
  messages.scrollTo({
    top: messages.scrollHeight,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

newMessagesButton.addEventListener("click", scrollMessagesToBottom);

messages.addEventListener(
  "scroll",
  () => {
    if (isNearMessagesBottom()) syncUnreadCount();
    else updateInChatNotice();
  },
  { passive: true },
);

function refreshChatAfterReturn() {
  expireChatHistoryIfNeeded();
  syncUnreadCount();
}

window.addEventListener("focus", refreshChatAfterReturn);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshChatAfterReturn();
});

function renderAssistantText(container, text) {
  container.replaceChildren();

  const lines = String(text).split("\n");
  const cells = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "")
      .split("|").map((cell) => cell.trim());

  const isSeparator = (line) => {
    if (!line?.trim().startsWith("|")) return false;
    return cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
  };

  let index = 0;

  while (index < lines.length) {
    const requestEnd = appendRequestCard(container, lines, index);
    if (requestEnd > index) {
      index = requestEnd;
      continue;
    }
    if (
      lines[index].trim().startsWith("|") &&
      isSeparator(lines[index + 1])
    ) {
      const headers = cells(lines[index]);
      const wrapper = document.createElement("div");
      wrapper.className = "chat-price-table";

      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headerRow = document.createElement("tr");

      for (const label of headers) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        headerRow.append(cell);
      }

      head.append(headerRow);
      table.append(head);

      const body = document.createElement("tbody");
      index += 2;

      while (
        index < lines.length &&
        lines[index].trim().startsWith("|") &&
        cells(lines[index]).length === headers.length
      ) {
        const row = document.createElement("tr");

        for (const value of cells(lines[index])) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }

        body.append(row);
        index++;
      }

      table.append(body);
      wrapper.append(table);
      container.append(wrapper);
    } else {
      container.append(
        document.createTextNode(
          lines[index] + (index < lines.length - 1 ? "\n" : ""),
        ),
      );
      index++;
    }
  }
}

function showMessage(
  author,
  text,
  at = new Date().toISOString(),
  restored = false,
) {
  const isUser = author === "Vy";
  const isNearBottom = isNearMessagesBottom();
  const row = document.createElement("div");
  row.className = `chat-message ${isUser ? "chat-message--user" : "chat-message--ai"}`;
  if (restored) row.classList.add("chat-message--restored");

  const avatar = document.createElement("span");
  avatar.className = "chat-message__avatar";
  avatar.setAttribute("aria-hidden", "true");

  const bubble = document.createElement("div");
  bubble.className = "chat-message__bubble";

  const meta = document.createElement("div");
  meta.className = "chat-message__meta";

  const name = document.createElement("span");
  name.textContent = author;

  const time = document.createElement("time");
  const now = new Date(at);
  time.dateTime = at;
  time.textContent = now.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const content = document.createElement("div");
  content.className = "chat-message__text";

if (isUser) {
  content.textContent = text;
} else {
  renderAssistantText(content, text);
}

  meta.append(name, time);
  bubble.append(content);

  const body = document.createElement("div");
  body.className = "chat-message__body";
  body.append(meta, bubble);

  if (isUser) {
    row.append(body);
  } else {
    row.append(avatar, body);
  }

  messages.append(row);

  if (!restored && (isUser || isNearBottom)) {
    requestAnimationFrame(scrollMessagesToBottom);
  }

  return row;
}

function placeHistoryRow(row, entry) {
  row.dataset.historyId = entry.id;

  for (const other of messages.querySelectorAll(
    ".chat-message[data-history-id]",
  )) {
    if (other === row) continue;
    const otherEntry = {
      id: other.dataset.historyId,
      at: other.querySelector("time").dateTime,
    };
    if (compareHistoryEntries(entry, otherEntry) < 0) {
      messages.insertBefore(row, other);
      return;
    }
  }

  const unsavedRow = [...messages.children].find(
    (other) =>
      other !== row &&
      other.classList.contains("chat-message") &&
      !other.dataset.historyId,
  );
  if (unsavedRow) messages.insertBefore(row, unsavedRow);
  else messages.append(row);
}

function showTypingMessage() {
  const row = showMessage("AI asistent", "");
  const content = row.querySelector(".chat-message__text");

  const dots = document.createElement("div");
  dots.className = "chat-typing";
  dots.setAttribute("role", "status");
  dots.setAttribute("aria-label", "AI asistent píše");

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dots.append(dot);
  }

  content.append(dots);
  return row;
}

function finishTypingMessage(row, text) {
  const wasNearBottom = isNearMessagesBottom();

  // Выезд строки остаётся только при появлении точек.
  row.style.animation = "none";
  for (const animation of row.getAnimations()) {
    animation.cancel();
  }

  const body = row.querySelector(".chat-message__body");
  const bubble = row.querySelector(".chat-message__bubble");
  const content = row.querySelector(".chat-message__text");

  const before = bubble.getBoundingClientRect();

  renderAssistantText(content, text);

  const after = bubble.getBoundingClientRect();
  const bodyWidth = body.getBoundingClientRect().width;
  const textWidth = content.getBoundingClientRect().width;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion || !before.width || !after.width) {
    if (wasNearBottom) {
      requestAnimationFrame(scrollMessagesToBottom);
    }
    return;
  }

  body.style.width = `${bodyWidth}px`;
  content.style.width = `${textWidth}px`;
  bubble.style.boxSizing = "border-box";
  bubble.style.overflow = "hidden";

  const expansion = bubble.animate(
    [
      {
        width: `${before.width}px`,
        height: `${before.height}px`,
      },
      {
        width: `${after.width}px`,
        height: `${after.height}px`,
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  );

  content.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 400, easing: "ease-out" },
  );

  const cleanup = () => {
    body.style.removeProperty("width");
    content.style.removeProperty("width");
    bubble.style.removeProperty("box-sizing");
    bubble.style.removeProperty("overflow");

    if (wasNearBottom) scrollMessagesToBottom();
  };

  expansion.onfinish = cleanup;
  expansion.oncancel = cleanup;
}

function showWelcomeMessage() {
  if (welcomeTask) return welcomeTask;

  const generation = chatGeneration;

  welcomeTask = Promise.resolve().then(async () => {
    let typingRow = null;
    let startedTyping = false;

    try {
      sendButton.disabled = true;
      updateSuggestions();

      // Сначала восстанавливаем существующий разговор.
      await syncServerSession();

      if (
        generation !== chatGeneration ||
        messages.querySelector(".chat-message")
      ) {
        return;
      }

      const welcomeText =
        chatRestartGreeting ?? "Dobrý den! 👋 S čím vám mohu pomoci? Napište mi, co se děje s vaším autem, nebo se zeptejte na služby, ceny či možnosti online objednání do servisu.";

      isAiTyping = true;
      startedTyping = true;
      updateLauncherStatus();

      typingRow = showTypingMessage();

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (!reducedMotion) {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      if (
        generation !== chatGeneration ||
        !typingRow.isConnected
      ) {
        typingRow.remove();
        return;
      }

      finishTypingMessage(typingRow, welcomeText);

      const welcomeEntry = rememberMessage(
        "welcome",
        welcomeText,
        typingRow.querySelector("time").dateTime,
        "welcome",
      );

      placeHistoryRow(typingRow, welcomeEntry);
    } catch (error) {
      typingRow?.remove();

      if (generation === chatGeneration) {
        showMessage(
          "AI asistent",
          error.message || uiMessages.restoreFailed,
        );
      }
    } finally {
      welcomeTask = null;

      if (generation === chatGeneration) {
        if (startedTyping && !recoveredRequestId && !activeChatPost) isAiTyping = false;
        sendButton.disabled = Boolean(recoveredRequestId || activeChatPost);
        updateLauncherStatus();
        updateSuggestions();
      }
    }
  });

  return welcomeTask;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sendButton.disabled) return;

  const message = input.value.trim();

  messages
    .querySelectorAll(".chat-message--validation-error")
    .forEach((row) => row.remove());

  if (!message || message.length > 1000) {
    const errorRow = showMessage(
      "AI asistent",
      uiMessages.invalidMessage,
    );
    errorRow.classList.add("chat-message--validation-error");
    return;
  }

  helpHintDismissed = true;
  hideHelpHint();

      const displayedState = {
    conversationId,
    revision: sessionRevision,
    confirmationToken,
    generation: chatGeneration,
    empty:
      serverHistoryTailId === null &&
      (sessionRevision === null || sessionRevision === 0) &&
      confirmationToken === null &&
      !chatHistory.some(entry =>
        ["user", "assistant"].includes(entry.role)
      ),
  };

  sendButton.disabled = true;

  try {
    await syncServerSession();
  } catch (error) {
    sendButton.disabled = false;
    showMessage("AI asistent", error.message);
    return;
  }

  if (recoveredRequestId) return;

    const stateChanged =
    displayedState.generation !== chatGeneration ||
    displayedState.conversationId !== conversationId ||
    displayedState.revision !== sessionRevision ||
    displayedState.confirmationToken !== confirmationToken;

    const emptySessionRenewed =
    displayedState.conversationId !== conversationId &&
    displayedState.empty &&
    displayedState.generation === chatGeneration &&
    serverHistoryTailId === null &&
    sessionRevision === 0 &&
    confirmationToken === null &&
    !chatHistory.some(entry =>
      ["user", "assistant"].includes(entry.role)
    );

  if (stateChanged && !emptySessionRenewed) {
    sendButton.disabled = false;
    sendButton.classList.remove("is-sending");
    updateSuggestions();
    scrollMessagesToBottom();
    input.focus();
    return;
  }

  const generation = chatGeneration;
  activeChatPost = true;
  sendButton.disabled = true;
  isAiTyping = true;
  updateLauncherStatus();
  updateSuggestions();
  const userRow = showMessage("Vy", message);
  const userEntry = rememberMessage(
    "user",
    message,
    userRow.querySelector("time").dateTime,
  );
  placeHistoryRow(userRow, userEntry);
  try {
    sessionStorage.setItem(PENDING_CHAT_MESSAGE_KEY, userEntry.id);
    sessionStorage.setItem(PENDING_CHAT_CONTEXT_KEY, JSON.stringify({ conversationId, entry: userEntry, animateSend: sendButton.classList.contains("is-sending") }));
  } catch {
    // Bez úložiště karta stále může dokončit aktuální požadavek.
  }
  input.value = "";
  resizeMessageInput();

  const typingRowPromise = Promise.resolve({
    row: showTypingMessage(),
    shownAt: performance.now(),
  });

  try {
    let reply;
    let nextIntake = null;
    let replyRole = "assistant";
    let serverUserMessage = null;
    let serverAssistantMessage = null;

    try {
      let response;
      let data;

      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            confirmationToken,
            messageId: userEntry.id,
            conversationId,
          }),
          signal: AbortSignal.timeout(75000),
        });

        data = await response.json();
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          throw new Error(
            uiMessages.timeout,
          );
        }

        if (!response) {
          throw new Error(
            uiMessages.connectionFailed,
          );
        }

        throw new Error(
          uiMessages.unreadableReply,
        );
      }

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : uiMessages.requestFailed,
        );
      }

      if (typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error(
          uiMessages.unavailable,
        );
      }

      if (
        generation !== chatGeneration ||
        data.conversationId !== conversationId
      )
        return;
            sessionRevision = data.revision;

      confirmationToken =
        typeof data.confirmationToken === "string"
          ? data.confirmationToken
          : null;

      receiveClientMessages(data);
      reply = data.reply;
      nextIntake = data.intake;
      serverUserMessage = data.userMessage;
      serverAssistantMessage = data.assistantMessage;
    } catch (error) {
      replyRole = "error";
      reply = error.message || uiMessages.requestFailed;
    }

    reply = limitMessageLength(reply);

    const { row, shownAt } = await typingRowPromise;
    if (generation !== chatGeneration || !row) {
      row?.remove();
      return;
    }
    const remaining = Math.max(0, 400 - (performance.now() - shownAt));
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    if (generation !== chatGeneration) {
      row.remove();
      return;
    }

    if (
      replyRole === "assistant" &&
      nextIntake &&
      typeof nextIntake === "object"
    ) {
      intakeState = nextIntake;
      try {
        localStorage.setItem(CHAT_INTAKE_KEY, JSON.stringify(nextIntake));
      } catch {
        // Chat může pokračovat i bez trvalého uložení stavu.
      }
    }

        if (
      replyRole === "assistant" &&
      isValidHistoryEntry(serverUserMessage) &&
      serverUserMessage.id === userEntry.id
    ) {
      chatHistory = chatHistory.filter(
        (entry) => entry.id !== userEntry.id,
      );

      const savedUser = rememberMessage(
        "user",
        serverUserMessage.content,
        serverUserMessage.at,
        serverUserMessage.id,
      );

      const userTime = userRow.querySelector("time");
      userTime.dateTime = savedUser.at;
      userTime.textContent = new Date(savedUser.at).toLocaleTimeString(
        "cs-CZ",
        { hour: "2-digit", minute: "2-digit" },
      );

            // Обновляем историю без повторной анимации сообщения клиента.
      userRow.style.animation = "none";

      for (const animation of userRow.getAnimations()) {
        animation.cancel();
      }

      placeHistoryRow(userRow, savedUser);
    }

    finishTypingMessage(row, reply);

    const serverReply =
      replyRole === "assistant" &&
      isValidHistoryEntry(serverAssistantMessage)
        ? serverAssistantMessage
        : null;

    const replyTime = row.querySelector("time");
    const replyAt = serverReply?.at ?? new Date().toISOString();

    replyTime.dateTime = replyAt;
    replyTime.textContent = new Date(replyAt).toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const replyEntry = rememberMessage(
      replyRole,
      reply,
      replyAt,
      serverReply?.id ?? makeMessageId(),
    );
    try {
      if (sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY) === userEntry.id) {
        sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);
        sessionStorage.removeItem(PENDING_CHAT_CONTEXT_KEY);
      }
    } catch {
      // Odpověď už je uložená v historii.
    }
    placeHistoryRow(row, replyEntry);
  } finally {
    if (generation === chatGeneration) {
      activeChatPost = false;
      isAiTyping = false;
      updateLauncherStatus();
      sendButton.disabled = false;
      sendButton.classList.remove("is-sending");
      updateSuggestions();
      input.focus({ preventScroll: true });
    }
  }
});

async function loadCompany() {
  const name = document.querySelector("#company-name");
  const services = document.querySelector("#company-services");

  try {
    const response = await fetch("/api/company");
    if (!response.ok) throw new Error("Nepodařilo se načíst údaje");

    const company = await response.json();
    name.textContent = company.name;

    for (const service of company.services) {
      const item = document.createElement("li");
      item.textContent = service.priceLabel
        ? `${service.name} — ${service.priceLabel}`
        : service.name;

      if (service.options?.length) {
        const details = document.createElement("small");
        details.textContent = service.options
          .map((option) =>
            option.priceLabel
              ? `${option.name} — ${option.priceLabel}`
              : option.name,
          )
          .join(" · ");
        item.append(document.createElement("br"), details);
      }

      services.append(item);
    }
  } catch {
    name.textContent = "Nepodařilo se načíst údaje autoservisu.";
  }
}

for (const entry of chatHistory) {
  const author = entry.role === "user" ? "Vy" : "AI asistent";
  const row = showMessage(author, entry.content, entry.at, true);
  placeHistoryRow(row, entry);
}

updateSuggestions();

setChatExpanded(chatUiState.expanded);

if (chatUiState.open) {
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
  chatPrompt.classList.remove("is-first-visit");
  chatHint.hidden = true;
  chatOpenText.textContent = "Váš AI asistent";
  syncUnreadCount();
  showWelcomeMessage();
  scheduleHelpHint();
  requestAnimationFrame(() => {
    restoreChatScroll(readChatScroll());
  });
} else if (isFirstVisit) {
  setTimeout(() => {
    if (chatPanel.hidden) chatPrompt.hidden = false;
  }, 2500);
} else {
  chatPrompt.hidden = false;
}

loadCompany();

if (new URLSearchParams(window.location.search).has("glass-preview")) {
  document.body.classList.add("glass-preview");

  const scene = document.createElement("div");
  scene.className = "glass-preview-scene";
  scene.setAttribute("aria-hidden", "true");
  scene.innerHTML = `
    <div class="glass-preview-topline">AUTOSERVIS <span>SLUŽBY &nbsp; CENÍK &nbsp; KONTAKT</span></div>
    <div class="glass-preview-hero">
      <span>TEST POZADÍ</span>
      <h2>Spolehlivý servis<br>pro vaše auto</h2>
      <p>Diagnostika, údržba a opravy na jednom místě.</p>
    </div>
    <div class="glass-preview-content">
      <div class="glass-preview-card">
        <strong>Rychlá diagnostika</strong>
        <p>Najdeme příčinu závady a navrhneme řešení.</p>
      </div>
      <div class="glass-preview-card glass-preview-card-accent">
        <strong>Objednejte se na servis</strong>
        <p>Vyberte si termín, který vám vyhovuje.</p>
      </div>
      <div class="glass-preview-lines">KVALITNÍ PÉČE O VÁŠ VŮZ<br>Transparentní ceny · Zkušený tým · Moderní vybavení</div>
    </div>`;
  document.body.prepend(scene);
}

void syncServerSession().catch(() => {});


// Settings stay local; they never submit a message to the assistant.
(() => {
  const trigger = document.querySelector("#chat-settings");
  const layer = document.querySelector("#chat-settings-layer");
  const sheet = layer.querySelector(".chat-settings-sheet");
  const heading = document.querySelector("#chat-settings-heading");
  const status = document.querySelector("#chat-settings-status");
  const views = ["options", "privacy", "confirm"].map(name => document.querySelector("#chat-settings-" + name));
  let open = false, closing = false, resetting = false;
  const inertBefore = new Map();
  let settingsMotion = [];
  let sheetMotion = null;
  const resize = () => layer.style.setProperty("--chat-settings-composer-height", form.getBoundingClientRect().height + "px");
  new ResizeObserver(resize).observe(form);

  function view(name) {
    for (const panel of views) panel.hidden = panel.id !== "chat-settings-" + name;
    heading.textContent = name === "privacy" ? "Soukromí a osobní údaje" : name === "confirm" ? "Nový rozhovor" : "Nastavení";
    status.textContent = "";
    document.querySelector("#chat-settings-expand-label").textContent = chatPanel.classList.contains("is-expanded") ? "Zmenšit chat" : "Rozbalit chat";
    document.querySelector('[data-setting="expand"] .chat-setting-icon path').setAttribute("d", chatExpand.querySelector("path").getAttribute("d"));
    sheet.scrollTop = 0;
  }
  async function closeSettings(restoreFocus = true) {
    if (!open || closing || resetting) return;
    closing = true;
    if (!chatMotionReduced.matches && !chatPanel.hidden) {
      // Fade the dimming out while the sheet slides beneath the clipped edge.
      for (const animation of settingsMotion) animation.reverse();
      const from = getComputedStyle(sheet).transform;
      sheetMotion?.cancel();
      sheetMotion = sheet.animate([
        { transform: from === "none" ? "translateY(0)" : from },
        { transform: "translateY(calc(100% + 40px))" },
      ], { duration: 380, easing: "cubic-bezier(.4, 0, .6, 1)", fill: "forwards" });
      await Promise.allSettled([sheetMotion.finished, ...settingsMotion.map(animation => animation.finished)]);
    }
    layer.hidden = true;
    sheetMotion?.cancel();
    sheetMotion = null;
    for (const animation of settingsMotion) animation.cancel();
    settingsMotion = [];
    layer.style.removeProperty("background-color");
    open = false;
    closing = false;
    chatPanel.classList.remove("settings-open");
    trigger.setAttribute("aria-expanded", "false");
    for (const [element, inert] of inertBefore) element.inert = inert;
    inertBefore.clear();
    if (restoreFocus && !chatPanel.hidden) trigger.focus({ preventScroll: true });
  }
  trigger.addEventListener("click", () => {
    if (open) { void closeSettings(); return; }
    setQuestionListOpen(false);
    hideHelpHint();
    view("options");
    resize();
    layer.hidden = false;
    open = true;
    trigger.setAttribute("aria-expanded", "true");
    chatPanel.classList.add("settings-open");
    const motionOptions = { duration: 380, easing: "ease-in-out", fill: "forwards" };
    settingsMotion = [];
    if (!chatMotionReduced.matches) {
      settingsMotion.push(layer.animate([
        { backgroundColor: "rgba(26, 49, 51, 0)" },
        { backgroundColor: "rgba(26, 49, 51, .16)" },
      ], motionOptions));
    } else layer.style.backgroundColor = "rgba(26, 49, 51, .16)";
    for (const child of chatPanel.children) {
      if (child === layer) continue;
      inertBefore.set(child, child.inert);
      child.inert = true;
      if (!chatMotionReduced.matches) {
        const opacity = getComputedStyle(child).opacity;
        settingsMotion.push(child.animate([{ opacity }, { opacity: String(Number(opacity) * .45) }], motionOptions));
      }
    }
    sheet.focus({ preventScroll: true });
    if (!chatMotionReduced.matches) sheetMotion = sheet.animate([
      { transform: "translateY(calc(100% + 40px))" },
      { transform: "translateY(0)" },
    ], { duration: 380, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" });
  });
  document.querySelector("#chat-settings-close").addEventListener("click", () => void closeSettings());
  layer.addEventListener("click", event => { if (event.target === layer) void closeSettings(); });
  layer.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); void closeSettings(); }
    if (event.key !== "Tab") return;
    const buttons = [...sheet.querySelectorAll("button:not(:disabled)")].filter(button => button.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet)) { event.preventDefault(); first?.focus(); }
  });
  sheet.addEventListener("click", async event => {
    const button = event.target.closest("[data-setting]");
    if (!button || resetting || closing) return;
    const action = button.dataset.setting;
    if (action === "back") { view("options"); sheet.focus(); }
    if (action === "expand") {
      const expanded = !chatPanel.classList.contains("is-expanded");
      setChatExpanded(expanded);
      chatUiState.expanded = expanded;
      saveChatExpandedState();
      view("options");
    }
    if (action === "privacy") { view("privacy"); sheet.focus(); }
    if (action === "new") {
      if (isAiTyping || activeChatPost || recoveredRequestId || sessionSync) { status.textContent = "Nejprve prosím počkejte na dokončení aktuálního požadavku."; return; }
      view("confirm"); sheet.focus();
    }
    if (action === "download") {
      const text = chatHistory.map(entry => `${entry.role === "user" ? "Vy" : "AI asistent"} · ${new Date(entry.at).toLocaleString("cs-CZ")}\n${entry.content}`).join("\n\n");
      if (!text) { status.textContent = "Konverzace zatím neobsahuje žádné zprávy."; return; }
      const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Caro-konverzace-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Přepis konverzace je připravený ke stažení.";
    }
    if (action === "confirm-new") {
      if (isAiTyping || activeChatPost || recoveredRequestId || sessionSync) { status.textContent = "Nejprve prosím počkejte na dokončení aktuálního požadavku."; return; }
      resetting = true; button.disabled = true;
      status.textContent = "Připravuji nový rozhovor…";
      try {
        const response = await fetch("/api/session/reset", { method: "POST", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("Reset rejected");
        // Only clear the browser after the server has accepted the reset.
        try {
          for (const key of Object.keys(localStorage)) if (key.startsWith(CHAT_MESSAGE_PREFIX)) localStorage.removeItem(key);
          for (const key of [CHAT_HISTORY_KEY, CHAT_LAST_READ_KEY, CHAT_OPENED_KEY, CHAT_INTAKE_KEY]) localStorage.removeItem(key);
          localStorage.setItem(CHAT_RESET_KEY, makeMessageId());
        } catch { /* The server reset still works without browser storage. */ }
        resetChatLocally({ resetServer: false });
        await syncServerSession();
        showWelcomeMessage();
        resetting = false;
        await closeSettings();
      } catch {
        status.textContent = "Nový rozhovor se nepodařilo načíst. Zkuste to prosím znovu.";
      } finally { resetting = false; button.disabled = false; }
    }
  });
})();
