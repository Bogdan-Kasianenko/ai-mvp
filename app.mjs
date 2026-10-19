import { readFile } from "node:fs/promises";
import { withPublicPrices } from "./pricing.mjs";
import express from "express";
import { fileURLToPath } from "node:url";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  InternalServerError,
} from "openai";
import { createChatHandler, createSessionHandler } from "./chat-route.mjs";
import { resolve } from "node:path";
import { getChatSession } from './chat-session.mjs';
import { messages } from './messages.mjs';

export function createApp({ chatOptions = {}, sessionOptions = {} } = {}) {
  const app = express();
  const sessionGetter = sessionOptions.getSession ?? chatOptions.getSession ?? getChatSession;
  function requestMessages(request,response) {
    let language=response.locals.language;
    if(!language && request.headers.cookie) {
      try { language=sessionGetter(request,response).language; } catch { /* Fall back when the session store itself is unavailable. */ }
    }
    return messages(language ?? 'cs');
  }
  const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Referrer-Policy", "same-origin");
    if (request.path.startsWith("/api"))
      response.set("Cache-Control", "no-store");
    if (
      request.method === "POST" &&
      request.headers.origin &&
      request.headers.origin !== `${request.protocol}://${request.get("host")}`
    ) {
      return response
        .status(403)
        .json({ error: requestMessages(request,response).crossOrigin });
    }
    next();
  });
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
    response.json(withPublicPrices(company));
  });

  app.post("/api/chat", createChatHandler({ loadCompanyData, ...chatOptions }));
  app.get("/api/session", createSessionHandler(sessionOptions));
  app.post(
    "/api/session/reset",
    createSessionHandler({ ...sessionOptions, reset: true }),
  );

  app.use((error, request, response, next) => {
    const t=requestMessages(request,response);
    if (error.type === "entity.parse.failed") {
      return response.status(400).json({ error: t.invalidJson });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: t.bodyTooLarge });
    }
    if (
      error.type === "charset.unsupported" ||
      error.type === "encoding.unsupported"
    ) {
      return response
        .status(415)
        .json({ error: t.unsupportedEncoding });
    }
    if (error.status === 400 && error.expose === true) {
      return response.status(400).json({
        error: t.invalidBody,
      });
    }
    if (error.code === "SESSION_CREATION_LIMIT") {
  return response.status(429).json({ error: t.limit });
}

if (error.code === "SESSION_CAPACITY") {
  return response.status(503).json({ error: t.unavailable });
}
    if (error instanceof APIConnectionTimeoutError) {
      return response.status(503).json({
        error: t.timeout,
      });
    }
    if (
      error.status === 429 ||
      error instanceof APIConnectionError ||
      error instanceof InternalServerError
    ) {
      console.error("AI request unavailable:", error.code || error.name);
      return response.status(503).json({
        error: t.unavailable,
      });
    }
    console.error("Request failed:", error.code || error.name);
    return response
      .status(500)
      .json({ error: t.requestFailed });
  });
  return app;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const listenHost = process.env.LISTEN_HOST || "127.0.0.1";
  const server = app.listen(port, listenHost, () => {
    console.log(`Open http://127.0.0.1:${port}`);
  });

  server.on("error", (error) => {
    console.error("Server could not start:", error.message);
    process.exitCode = 1;
  });
}
