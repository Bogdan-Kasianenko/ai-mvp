import { getReply } from "./service.mjs";
import express from "express";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));

app.disable("x-powered-by");
app.use(express.static(publicDirectory));
app.use("/api", express.json({ limit: "8kb" }));

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
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

  const reply = await getReply(message);
  return response.json({ reply });
});

app.use((error, request, response, next) => {
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ error: "Neplatný JSON." });
  }
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "Zpráva je příliš dlouhá." });
  }
  console.error("Request failed:", error.message);
  return response.status(500).json({ error: "Požadavek se nepodařilo zpracovat." });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  console.error("Server could not start:", error.message);
  process.exitCode = 1;
});
