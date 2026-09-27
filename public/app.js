const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const messages = document.querySelector("#messages");
const statusText = document.querySelector("#request-status");

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

chatOpen.addEventListener("click", () => {
  chatPanel.hidden = false;
  chatPrompt.hidden = true;
  input.focus();
});

chatClose.addEventListener("click", () => {
  chatPanel.hidden = true;
  chatPrompt.hidden = false;
  chatOpen.focus();
});

function showMessage(author, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = `${author}: ${text}`;
  messages.append(paragraph);
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "AI asistent píše");

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    indicator.append(dot);
  }

  form.append(indicator);
  return indicator;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();

  if (!message || message.length > 1000) {
    statusText.textContent = "Zadejte zprávu o délce 1 až 1000 znaků.";
    return;
  }

  sendButton.disabled = true;
  statusText.textContent = "";
  showMessage("Vy", message);
  input.value = "";
  resizeMessageInput();

  const indicator = showTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Zprávu se nepodařilo odeslat.");
    }

    const data = await response.json();
    if (typeof data.reply !== "string") {
      throw new Error("Invalid reply");
    }

    showMessage("AI asistent", data.reply);
  } catch (error) {
    statusText.textContent =
      error.message || "Zprávu se nepodařilo odeslat. Zkuste to znovu.";
  } finally {
    indicator.remove();
    messages.scrollTop = messages.scrollHeight;
    sendButton.disabled = false;
    input.focus();
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
}
