import { readFile } from "node:fs/promises";
import { getReply } from "./service.mjs";
import express from "express";
import { fileURLToPath } from "node:url";
import { APIConnectionError, APIConnectionTimeoutError, InternalServerError } from "openai";

const app = express();
const port = Number(process.env.PORT || 3000);
const listenHost = process.env.LISTEN_HOST || "127.0.0.1";
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));

app.disable("x-powered-by");
app.use(express.static(publicDirectory));
app.use("/api", express.json({ limit: "64kb" }));

async function loadCompanyData() {
  const file = new URL("./company.json", import.meta.url);
  const text = await readFile(file, "utf8");
  return JSON.parse(text);
}

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/company", async (request, response) => {
  const company = await loadCompanyData();
  response.json(company);
});

app.post("/api/chat", async (request, response) => {
  const message = request.body?.message;

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > 1000
  ) {
    return response.status(400).json({
      error: "Zadejte zprávu o délce 1 až 1000 znaků."
    });
  }

  const history = request.body?.history ?? [];

  const validHistory =
    Array.isArray(history) &&
    history.length <= 12 &&
    history.every(
      (item) =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim().length > 0 &&
        item.content.length <= 2000
    ) &&
    history.reduce((total, item) => total + item.content.length, 0) <= 12000;

  if (!validHistory) {
    return response.status(400).json({
      error: "Neplatná historie chatu."
    });
  }

  const cleanHistory = history.map(({ role, content }) => ({
    role,
    content: content.trim()
  }));
  const company = await loadCompanyData();
  const result = await getReply(message, company, cleanHistory);

  if (result.kind === "refusal") {
    return response.json({
      reply: "S tímto požadavkem Vám nemohu pomoci. Můžete se zeptat na něco jiného.",
      refused: true
    });
  }

  if (typeof result.text !== "string" || !result.text.trim()) {
    return response.status(502).json({
      error: "AI asistent nyní nemůže odpovědět. Zkuste to prosím později."
    });
  }

  return response.json({ reply: result.text });
});

app.use((error, request, response, next) => {
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ error: "Neplatný JSON." });
  }
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "Zpráva je příliš dlouhá." });
  }
  if (error.type === "charset.unsupported" || error.type === "encoding.unsupported") {
    return response.status(415).json({ error: "Nepodporované kódování požadavku." });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return response.status(503).json({
      error: "AI asistent neodpovídá. Zkuste to prosím znovu."
    });
  }
  if (
    error.status === 429 ||
    error instanceof APIConnectionError ||
    error instanceof InternalServerError
  ) {
    console.error("AI request unavailable:", error.message);
    return response.status(503).json({
      error: "AI asistent je dočasně nedostupný. Zkuste to prosím později."
    });
  }
  console.error("Request failed:", error.message);
  return response.status(500).json({ error: "Požadavek se nepodařilo zpracovat." });
});

const server = app.listen(port, listenHost, () => {
  console.log(`Open http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  console.error("Server could not start:", error.message);
  process.exitCode = 1;
});
