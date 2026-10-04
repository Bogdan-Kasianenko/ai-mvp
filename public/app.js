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

let isFirstVisit = false;
try {
  isFirstVisit = localStorage.getItem("autoservice-chat-visited") !== "1";
  localStorage.setItem("autoservice-chat-visited", "1");
} catch {
  // Если хранилище браузера недоступно, показываем обычную кнопку.
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
}

const CHAT_HISTORY_KEY = "autoservice-chat-history-v1";
const CHAT_MESSAGE_PREFIX = "autoservice-chat-message-v1:";
const PENDING_CHAT_MESSAGE_KEY = "autoservice-chat-pending-v1";
const MAX_SAVED_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 20000;
const TRUNCATION_NOTICE = "\n\n[Zpráva byla zkrácena.]";
let chatHistory = [];

function limitMessageLength(content) {
  if (content.length <= MAX_MESSAGE_LENGTH) return content;

  let end = MAX_MESSAGE_LENGTH - TRUNCATION_NOTICE.length;
  const lastCode = content.charCodeAt(end - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) end--;
  return content.slice(0, end) + TRUNCATION_NOTICE;
}

function isValidHistoryEntry(entry) {
  return entry &&
    typeof entry.id === "string" &&
    ["user", "assistant", "error", "welcome"].includes(entry.role) &&
    typeof entry.content === "string" &&
    entry.content.trim().length > 0 &&
    typeof entry.at === "string" &&
    !Number.isNaN(Date.parse(entry.at));
}

function normalizeHistoryEntry(entry) {
  return isValidHistoryEntry(entry)
    ? {
        id: entry.id,
        role: entry.role,
        content: limitMessageLength(entry.content),
        at: entry.at
      }
    : null;
}

function compareHistoryEntries(a, b) {
  return Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id);
}

function readStoredHistory() {
  const entries = new Map();

  try {
    const oldHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "null");
    if (Array.isArray(oldHistory)) {
      oldHistory.forEach((entry, index) => {
        const migrated = normalizeHistoryEntry({ ...entry, id: `legacy-${index}-${entry?.at}` });
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
        const entry = normalizeHistoryEntry(JSON.parse(localStorage.getItem(key)));
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

  return [...entries.values()].sort(compareHistoryEntries).slice(-MAX_SAVED_MESSAGES);
}

function migrateOldHistory() {
  try {
    const oldHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "null");
    if (!Array.isArray(oldHistory)) return;

    oldHistory.forEach((entry, index) => {
      const migrated = normalizeHistoryEntry({ ...entry, id: `legacy-${index}-${entry?.at}` });
      if (!migrated) return;
      localStorage.setItem(CHAT_MESSAGE_PREFIX + migrated.id, JSON.stringify(migrated));
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

    if (keys.length <= MAX_SAVED_MESSAGES) return;
    const newest = new Set(readStoredHistory().map((entry) => CHAT_MESSAGE_PREFIX + entry.id));
    for (const key of keys) {
      if (!newest.has(key)) localStorage.removeItem(key);
    }
  } catch {
    // Ошибка очистки не должна прерывать чат.
  }
}

function makeMessageId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rememberMessage(role, content, at = new Date().toISOString(), id = makeMessageId()) {
  const entry = { id, role, content: limitMessageLength(content), at };
  if (chatHistory.some((message) => message.id === id)) return entry;

  chatHistory.push(entry);
  chatHistory.sort(compareHistoryEntries);
  chatHistory = chatHistory.slice(-MAX_SAVED_MESSAGES);

  try {
    localStorage.setItem(CHAT_MESSAGE_PREFIX + id, JSON.stringify(entry));
    pruneStoredHistory();
  } catch {
    // Чат продолжит работать, даже если браузер запретил сохранение.
  }

  return entry;
}

function refreshChatHistory() {
  const knownIds = new Set(chatHistory.map((entry) => entry.id));
  const newEntries = readStoredHistory().filter((entry) => !knownIds.has(entry.id));

  for (const entry of newEntries) {
    const author = entry.role === "user" ? "Vy" : "AI asistent";
    const row = showMessage(author, entry.content, entry.at, true);
    placeHistoryRow(row, entry);
  }

  chatHistory.push(...newEntries);
  chatHistory.sort(compareHistoryEntries);
  chatHistory = chatHistory.slice(-MAX_SAVED_MESSAGES);
}

migrateOldHistory();
chatHistory = readStoredHistory();
pruneStoredHistory();

try {
  const pendingId = sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY);
  if (pendingId) {
    if (chatHistory.some((entry) => entry.id === pendingId && entry.role === "user")) {
      rememberMessage(
        "error",
        "Odpověď byla přerušena obnovením stránky. Odešlete zprávu prosím znovu.",
        new Date().toISOString(),
        `interrupted-${pendingId}`
      );
    }
    sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);
  }
} catch {
  // Nedostupné úložiště nesmí zabránit načtení chatu.
}

window.addEventListener("storage", (event) => {
  if (event.key?.startsWith(CHAT_MESSAGE_PREFIX)) refreshChatHistory();
});

function getRecentContext() {
  refreshChatHistory();
  const context = [];
  let totalLength = 0;

  for (let i = chatHistory.length - 1; i >= 0 && context.length < 12; i--) {
    const entry = chatHistory[i];
    if (entry.role !== "user" && entry.role !== "assistant") continue;

    const content = entry.content.slice(0, 2000);
    if (totalLength + content.length > 12000) break;

    context.unshift({ role: entry.role, content });
    totalLength += content.length;
  }

  return context;
}

function resizeMessageInput() {
  input.style.height = "24px";

  const neededHeight = input.scrollHeight;
  input.style.height = `${Math.min(neededHeight, 72)}px`;
  input.style.overflowY = neededHeight > 72 ? "auto" : "hidden";
}

input.addEventListener("input", resizeMessageInput);

input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

  event.preventDefault();
  if (!sendButton.disabled) form.requestSubmit(sendButton);
});

const chatMotionReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let chatIsClosing = false;

chatOpen.addEventListener("click", () => {
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
  chatUiState.open = true;
  saveChatOpenState();
  chatPrompt.classList.remove("is-first-visit");
  chatHint.hidden = true;
  chatOpenText.textContent = "Váš AI asistent";
  unreadCount = 0;
  updateLauncherStatus();

  const hadMessages = messages.childElementCount > 0;
  showWelcomeMessage();

  if (!chatMotionReduced.matches) {
    chatPanel.animate(
      [
        { opacity: 0, transform: "translateY(20px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)" }
    );
  }

  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;

    if (!hadMessages || chatMotionReduced.matches) return;

    const recentRows = [...messages.querySelectorAll(".chat-message")].slice(-5);

    recentRows.forEach((row, index) => {
      row.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        {
          duration: 340,
          delay: index * 45,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "backwards"
        }
      );
    });
  });
  input.focus();
});

const chatExpand = document.querySelector("#chat-expand");

chatClose.addEventListener("click", async () => {
  if (chatIsClosing) return;
  chatIsClosing = true;
  chatUiState.open = false;
  saveChatOpenState();

  if (!chatMotionReduced.matches) {
    const animation = chatPanel.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(18px)" }
      ],
      { duration: 190, easing: "ease-in", fill: "forwards" }
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
    expanded ? "Zmenšit chat" : "Zvětšit chat"
  );

  chatExpand.querySelector("path").setAttribute(
    "d",
    expanded
      ? "M5 5l8 8m0-7v7H6M25 25l-8-8m0 7v-7h7"
      : "M13 13 5 5M5 12V5h7M17 17l8 8m-7 0h7v-7"
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
      : "smooth"
  });
}

function showMessage(author, text, at = new Date().toISOString(), restored = false) {
  const isUser = author === "Vy";
  const isNearBottom =
    messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96;
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
    minute: "2-digit"
  });

  const content = document.createElement("div");
  content.className = "chat-message__text";
  content.textContent = text;

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

  for (const other of messages.querySelectorAll(".chat-message[data-history-id]")) {
    if (other === row) continue;
    const otherEntry = {
      id: other.dataset.historyId,
      at: other.querySelector("time").dateTime
    };
    if (compareHistoryEntries(entry, otherEntry) < 0) {
      messages.insertBefore(row, other);
      return;
    }
  }

  const unsavedRow = [...messages.children].find((other) =>
    other !== row && other.classList.contains("chat-message") && !other.dataset.historyId
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
  const isNearBottom =
    messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96;

  const body = row.querySelector(".chat-message__body");
  const bubble = row.querySelector(".chat-message__bubble");
  const content = row.querySelector(".chat-message__text");

  const before = bubble.getBoundingClientRect();

  content.textContent = text;

  const after = bubble.getBoundingClientRect();
  const bodyWidth = body.getBoundingClientRect().width;
  const textWidth = content.getBoundingClientRect().width;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reducedMotion || before.width === 0 || after.width === 0) {
    if (isNearBottom) requestAnimationFrame(scrollMessagesToBottom);
    return;
  }

  // Текст сохраняет итоговые переносы, пока пузырь расширяется.
  body.style.width = `${bodyWidth}px`;
  content.style.width = `${textWidth}px`;
  bubble.style.boxSizing = "border-box";
  bubble.style.overflow = "hidden";

  const expansion = bubble.animate(
    [
      { width: `${before.width}px`, height: `${before.height}px` },
      { width: `${after.width}px`, height: `${after.height}px` }
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)"
    }
  );

  content.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 0, transform: "translateY(4px)", offset: 0.4 },
      { opacity: 1, transform: "translateY(0)" }
    ],
    { duration: 520, easing: "ease-out" }
  );

  expansion.onfinish = () => {
    body.style.removeProperty("width");
    content.style.removeProperty("width");
    bubble.style.removeProperty("box-sizing");
    bubble.style.removeProperty("overflow");

    if (isNearBottom) scrollMessagesToBottom();
  };
}

function showWelcomeMessage() {
  if (messages.childElementCount > 0) return;

  sendButton.disabled = true;
  isAiTyping = true;
  updateLauncherStatus();
  const row = showTypingMessage();

  setTimeout(() => {
    if (chatHistory.some((entry) => entry.role === "welcome")) {
      row.remove();
      isAiTyping = false;
      updateLauncherStatus();
      sendButton.disabled = false;
      return;
    }

    const welcomeText = "Dobrý den! 👋 S čím vám mohu pomoci? Napište mi, co se děje s vaším autem, nebo se zeptejte na služby, ceny či možnosti online objednání do servisu.";
    finishTypingMessage(row, welcomeText);
    const welcomeEntry = rememberMessage("welcome", welcomeText, row.querySelector("time").dateTime, "welcome");
    placeHistoryRow(row, welcomeEntry);

    isAiTyping = false;
    if (chatPanel.hidden) unreadCount += 1;
    updateLauncherStatus();
    sendButton.disabled = false;
  }, 2000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sendButton.disabled) return;

  const message = input.value.trim();

  if (!message || message.length > 1000) {
    showMessage("AI asistent", "Zadejte zprávu o délce 1 až 1000 znaků.");
    return;
  }

  const history = getRecentContext();
  sendButton.disabled = true;
  isAiTyping = true;
  updateLauncherStatus();
  sendButton.classList.add("is-sending");
  const userRow = showMessage("Vy", message);
  const userEntry = rememberMessage("user", message, userRow.querySelector("time").dateTime);
  placeHistoryRow(userRow, userEntry);
  try {
    sessionStorage.setItem(PENDING_CHAT_MESSAGE_KEY, userEntry.id);
  } catch {
    // Bez úložiště karta stále může dokončit aktuální požadavek.
  }
  input.value = "";
  resizeMessageInput();

  const typingRowPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        row: showTypingMessage(),
        shownAt: performance.now()
      });
    }, 650);
  });

  try {
    let reply;
    let replyRole = "assistant";

    try {
      let response;
      let data;

      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
          signal: AbortSignal.timeout(30000)
        });

        data = await response.json();
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          throw new Error("Odpověď trvá příliš dlouho. Zkuste to prosím znovu.");
        }

        if (!response) {
          throw new Error("Nepodařilo se připojit k serveru. Zkuste to prosím později.");
        }

        throw new Error("Odpověď se nepodařilo načíst. Zkuste to prosím znovu.");
      }

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : "Zprávu se nepodařilo zpracovat. Zkuste to prosím později."
        );
      }

      if (typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error("AI asistent nyní nemůže odpovědět. Zkuste to prosím později.");
      }

      reply = data.reply;
    } catch (error) {
      replyRole = "error";
      reply = error.message || "Zprávu se nepodařilo odeslat. Zkuste to znovu.";
    }

    reply = limitMessageLength(reply);

    const { row, shownAt } = await typingRowPromise;
    const remaining = Math.max(0, 400 - (performance.now() - shownAt));
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    finishTypingMessage(row, reply);
    const replyTime = row.querySelector("time");
    const now = new Date();
    replyTime.dateTime = now.toISOString();
    replyTime.textContent = now.toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const replyEntry = rememberMessage(replyRole, reply, replyTime.dateTime);
    try {
      if (sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY) === userEntry.id) {
        sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);
      }
    } catch {
      // Odpověď už je uložená v historii.
    }
    placeHistoryRow(row, replyEntry);
    if (chatPanel.hidden) unreadCount += 1;
  } finally {
    isAiTyping = false;
    updateLauncherStatus();
    sendButton.disabled = false;
    sendButton.classList.remove("is-sending");
    input.focus({ preventScroll: true });
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
      const price = service.price === null
        ? "cena bude upřesněna"
        : `${service.price} Kč`;

      item.textContent = `${service.name} — ${price}`;
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

setChatExpanded(chatUiState.expanded);

if (chatUiState.open) {
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
  chatPrompt.classList.remove("is-first-visit");
  chatHint.hidden = true;
  chatOpenText.textContent = "Váš AI asistent";
  updateLauncherStatus();
  showWelcomeMessage();
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
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
