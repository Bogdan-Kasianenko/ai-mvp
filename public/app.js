const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const messages = document.querySelector("#messages");

const chatPanel = document.querySelector("#chat-panel");
const chatOpen = document.querySelector("#chat-open");
const chatClose = document.querySelector("#chat-close");
const chatPrompt = document.querySelector("#chat-prompt");

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

chatOpen.addEventListener("click", () => {
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
    showWelcomeMessage();
  input.focus();
});

chatClose.addEventListener("click", () => {
  chatPanel.hidden = true;
  chatPrompt.hidden = false;
  chatOpen.focus();
});

function scrollMessagesToBottom() {
  messages.scrollTo({
    top: messages.scrollHeight,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth"
  });
}

function showMessage(author, text) {
  const isUser = author === "Vy";
  const isNearBottom =
    messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96;
  const row = document.createElement("div");
  row.className = `chat-message ${isUser ? "chat-message--user" : "chat-message--ai"}`;

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
  const now = new Date();
  time.dateTime = now.toISOString();
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

  if (isUser || isNearBottom) {
    requestAnimationFrame(scrollMessagesToBottom);
  }

  return row;
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
  const row = showTypingMessage();

  setTimeout(() => {
    finishTypingMessage(
      row,
      "Dobrý den! 👋 S čím vám mohu pomoci? Napište mi, co se děje s vaším autem, nebo se zeptejte na služby, ceny či možnosti online objednání do servisu."
    );
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

    sendButton.disabled = true;
  sendButton.classList.add("is-sending");
  showMessage("Vy", message);
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

       try {
      let response;
      let data;

      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
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
      reply = error.message || "Zprávu se nepodařilo odeslat. Zkuste to znovu.";
    }

    const { row, shownAt } = await typingRowPromise;
    const remaining = Math.max(0, 400 - (performance.now() - shownAt));
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    finishTypingMessage(row, reply);
  } finally {
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

  chatPanel.hidden = false;
  chatPrompt.hidden = true;
    showWelcomeMessage();
}
