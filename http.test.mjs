import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./app.mjs";
import { createChatSessionStore } from "./chat-session.mjs";
import { emptyIntakeState } from "./intake.mjs";
import { handleSendConfirmation } from "./request-flow.mjs";

test("HTTP workflow: trusted collection, price detour, consent, status, reload and reset", async () => {
  const store = createChatSessionStore();
  let sent = 0,
    calls = 0;
  const replyToMessage = async (message, _company, _history, intake) => {
    calls++;
    if (message === "prepare") {
      intake = emptyIntakeState();
      Object.assign(intake, {
        intent: "service_request",
        serviceId: "oil_filters",
        serviceOptionId: "engine_oil",
        requestedWork: "Oil and filter",
        customerParts: true,
        oilFilterScopeReviewed: true,
        additionalServicesReviewed: true,
                preferredTime: "2026-10-26",
      });
      Object.assign(intake.vehicle, {
        brand: "Suzuki",
        model: "Swift",
        year: "2018",
      });
      Object.assign(intake.customer, {
        name: "Test",
        email: "test@example.com",
      });
    }
    return {
      kind: "reply",
      text:
        message === "price"
          ? "Cena výměny oleje začíná od 500 Kč za práci."
          : "Děkuji.",
      intake,
      language: "cs",
      priceQuoted: message === "price",
      submissionAction:
        message === "yes"
          ? "confirm_send"
          : message === "status"
            ? "ask_status"
            : "none",
    };
  };
  const app = createApp({
    chatOptions: {
      getSession: store,
      replyToMessage,
      sendConfirmation: (args) =>
        handleSendConfirmation({ ...args, sendRequest: async () => sent++ }),
    },
    sessionOptions: { getSession: store },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port;
  let cookie;
  async function call(path, body, extra = {}) {
    const response = await fetch(url + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return { response, body: await response.json() };
  }
  try {
    const start = await call("/api/session");
    assert.match(start.response.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(start.body.history.length, 0);
    const offer = await call("/api/chat", {
      message: "prepare",
      messageId: "prepare-1",
      conversationId: start.body.conversationId,
    });
    assert.ok(offer.body.confirmationToken);
    const price = await call("/api/chat", {
      message: "price",
      messageId: "price-1",
      conversationId: start.body.conversationId,
      confirmationToken: offer.body.confirmationToken,
    });
    assert.match(price.body.reply, /500 Kč/);
    assert.doesNotMatch(price.body.reply, /Zkontrolujte/);
    const sendBody = {
      message: "yes",
      messageId: "send-1",
      conversationId: start.body.conversationId,
      confirmationToken: price.body.confirmationToken,
    };
    const delivery = await call("/api/chat", sendBody);
    assert.equal(sent, 1);
    assert.match(delivery.body.reply, /byla odeslána/);
    const count = calls;
    await call("/api/chat", sendBody);
    assert.equal(sent, 1);
    assert.equal(calls, count);
    const restore = await call("/api/session");
    assert.equal(restore.body.confirmationToken, null);
    assert.ok(restore.body.history.length > 0);
    const status = await call("/api/chat", { message: "status" });
    assert.match(status.body.reply, /Ano, žádost byla odeslána/);
    const reset = await call("/api/session/reset", {});
    assert.notEqual(reset.body.conversationId, start.body.conversationId);
    assert.equal(reset.body.history.length, 0);
    const stale = await call("/api/chat", {
      message: "yes",
      conversationId: start.body.conversationId,
    });
    assert.equal(stale.response.status, 409);
    assert.equal(sent, 1);
    const forbidden = await call(
      "/api/chat",
      { message: "hello" },
      { Origin: "https://unrelated.example" },
    );
    assert.equal(forbidden.response.status, 403);
    const long = await call("/api/chat", { message: "x".repeat(1001) });
    assert.equal(long.response.status, 400);
    const prices = await call("/api/company");
    assert.ok(
      prices.body.services.some((s) =>
        s.options?.some((o) => o.priceLabel?.includes("400")),
      ),
    );
    for (const path of [
      "/.env",
      "/storage/caro.sqlite",
      "/archive/request-flow.test.mjs.disabled",
    ])
      assert.equal((await fetch(url + path)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
