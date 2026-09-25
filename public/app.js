const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const messages = document.querySelector("#messages");
const statusText = document.querySelector("#request-status");

function showMessage(author, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = `${author}: ${text}`;
  messages.append(paragraph);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || message.length > 1000) {
    statusText.textContent = "Zadejte zprávu o délce 1 až 1000 znaků.";
    return;
  }

  sendButton.disabled = true;
  statusText.textContent = "Odesíláme zprávu…";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    if (typeof data.reply !== "string") throw new Error("Invalid reply");

    showMessage("Vy", message);
    showMessage("Server (test)", data.reply);
    input.value = "";
    statusText.textContent = "";
  } catch {
    statusText.textContent = "Zprávu se nepodařilo odeslat. Zkuste to znovu.";
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
});
