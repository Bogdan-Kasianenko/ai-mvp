import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "./storage.mjs";
import {
  createChatSessionStore,
  prepareConfirmation,
  confirmationMatches,
} from "./chat-session.mjs";
import {
  emptyIntakeState,
  missingIntakeFields,
  validateModelResponse,
  normalizeIntakeState,
} from "./intake.mjs";
import {
  handleSendConfirmation,
  deliveryStatus,
  readyToSend,
  wasRequestSent,
  presentRequestStep,
} from "./request-flow.mjs";
import { buildRequestEmail } from "./mailer.mjs";
import { getReply } from "./service.mjs";
import { createSessionHandler } from "./chat-route.mjs";

const company = JSON.parse(
  readFileSync(new URL("./company.json", import.meta.url), "utf8"),
);
function full() {
  const s = emptyIntakeState();
  Object.assign(s, {
    intent: "service_request", selectedOperations: ["oil_filters:engine_oil"],
    serviceId: "oil_filters",
    serviceOptionId: "engine_oil",
    customerParts: false,
    oilFilterScopeReviewed: true,
    requestedWork: "Výměna motorového oleje a olejového filtru",
    additionalServicesReviewed: true,
    preferredTime: "25. 10. 2026",
  });
  Object.assign(s.vehicle, {
    brand: "Suzuki",
    model: "Swift",
    year: "2018",
    engine: "1,4 l",
    fuel: "benzín",
  });
    Object.assign(s.customer, {
    name: "Test Customer",
    email: "test@example.com",
  });
  return s;
}
function res() {
  return {
    cookie(_n, v) {
      this.id = v;
    },
    set() {},
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}
function session(repo, id) {
  const store = createChatSessionStore({ repository: repo });
  const response = res();
  const s = store(
    { headers: { cookie: id ? "caro_session=" + id : "" }, secure: false },
    response,
  );
  return s;
}
function prepared(repo) {
  const s = session(repo);
  s.intake = full();
  prepareConfirmation(s);
  s.persist();
  return s;
}

test("unknown parts blocks a material job, but not diagnostics", () => {
  const s = full();
  s.customerParts = null;
  assert.equal(readyToSend(s, company), false);
  assert.ok(missingIntakeFields(s, company).includes("customerParts"));
  s.selectedOperations = ["diagnostics:"];
  s.serviceId = "diagnostics";
  s.serviceOptionId = null;
  assert.equal(readyToSend(s, company), true);
});

test("oil request needs the full filter scope, not merely agreement to an oil filter", () => {
  const state = full();
  state.oilFilterScopeReviewed = false;
  assert.ok(missingIntakeFields(state, company).includes('oilFilterScopeReviewed'));
  assert.equal(readyToSend(state, company), false);
  const normalized = normalizeIntakeState({...state, oilFilterScopeReviewed:true},company);
  assert.equal(normalized.oilFilterScopeReviewed, true);
  assert.equal(readyToSend(normalized, company), true);
  state.selectedOperations = ['oil_filters:cabin_filter'];
  state.serviceOptionId = 'cabin_filter';
  assert.equal(readyToSend(state, company), true, 'A cabin-filter-only job does not require an oil-service upsell');
});
test("unknown year explicitly skipped can be submitted; mandatory contact cannot be skipped", () => {
  const s = full();
  s.vehicle.year = null;
  s.skipped = ["vehicle.year"];
  assert.equal(readyToSend(s, company), true);
  s.customer.email = null;
  s.skipped.push("customer.contact");
  assert.equal(readyToSend(s, company), false);
  assert.ok(missingIntakeFields(s, company).includes("customer.contact"));
});
test("mail contains parts, mileage, oil history, contacts and full requested work", () => {
  const s = full();
  s.customerParts = true;
  s.vehicle.mileage = "123000 km";
  s.problem.lastOilChange = "2025";
  const text = buildRequestEmail(s, company, "test-id");
  for (const value of [
    "vlastní díly zákazníka",
    "123000 km",
    "2025",
    "test@example.com",
    s.requestedWork,
  ])
    assert.ok(text.includes(value));
});
test("session and successful sending survive closing and reopening the database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caro-test-"));
  const path = join(dir, "test.sqlite");
  let repo;
  try {
    repo = createRepository(path);
    const s = prepared(repo);
    const id = s.id;
    const token = s.confirmation.token;
    let calls = 0;
    await handleSendConfirmation({
      session: s,
      confirmationToken: token,
      company,
      ip: "test",
      sendRequest: async () => calls++,
    });
    s.persist();
    repo.close();
    repo = createRepository(path);
    const restored = session(repo, id);
    assert.equal(wasRequestSent(restored), true);
    restored.intake.vehicle.mileage = "99999";
    assert.equal(wasRequestSent(restored), true);
    restored.intake = full();
    prepareConfirmation(restored);
    await handleSendConfirmation({
      session: restored,
      confirmationToken: restored.confirmation.token,
      company,
      ip: "test",
      sendRequest: async () => calls++,
    });
    assert.equal(calls, 1);
  } finally {
    repo?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("identical drafts in different sessions do not share delivery status", async () => {
  const repo = createRepository();
  const a = prepared(repo),
    b = prepared(repo);
  let calls = 0;
  await handleSendConfirmation({
    session: a,
    confirmationToken: a.confirmation.token,
    company,
    ip: "a",
    sendRequest: async () => calls++,
  });
  assert.equal(wasRequestSent(b), false);
  await handleSendConfirmation({
    session: b,
    confirmationToken: b.confirmation.token,
    company,
    ip: "b",
    sendRequest: async () => calls++,
  });
  assert.equal(calls, 2);
  repo.close();
});
test("ambiguous SMTP failure cannot trigger automatic duplicate delivery", async () => {
  const repo = createRepository(),
    s = prepared(repo);
  let calls = 0;
  const sendRequest = async () => {
    calls++;
    throw Object.assign(new Error("lost connection after DATA"), {
      code: "ETIMEDOUT",
    });
  };
  const first = await handleSendConfirmation({
    session: s,
    confirmationToken: s.confirmation.token,
    company,
    ip: "test",
    sendRequest,
  });
  assert.equal(first.status, 200);
  assert.equal(deliveryStatus(s), "unknown");
  prepareConfirmation(s);
  await handleSendConfirmation({
    session: s,
    confirmationToken: s.confirmation.token,
    company,
    ip: "test",
    sendRequest,
  });
  assert.equal(calls, 1);
  s.intake.preferredTime = "26. 10. 2026";
  s.revision++;
  prepareConfirmation(s);
  await handleSendConfirmation({
    session: s,
    confirmationToken: s.confirmation.token,
    company,
    ip: "test",
    sendRequest,
  });
  assert.equal(
    calls,
    1,
    "An uncertain send also blocks a changed draft from creating a duplicate",
  );
  repo.close();
});
test("explicit SMTP rejection permits a deliberate retry and never reports success", async () => {
  const repo = createRepository(),
    s = prepared(repo);
  const rejected = await handleSendConfirmation({
    session: s,
    confirmationToken: s.confirmation.token,
    company,
    ip: "test",
    sendRequest: async () => {
      throw Object.assign(new Error("rejected"), { responseCode: 550 });
    },
  });
  assert.equal(rejected.status, 503);
  assert.equal(deliveryStatus(s), "failed");
  const sent = await handleSendConfirmation({
    session: s,
    confirmationToken: s.confirmation.token,
    company,
    ip: "test",
    sendRequest: async () => {},
  });
  assert.equal(sent.status, 200);
  assert.equal(deliveryStatus(s), "sent");
  repo.close();
});
test("durable lease excludes a second store instance", () => {
  const repo = createRepository(),
    a = session(repo),
    b = session(repo, a.id);
  assert.equal(a.acquire(), true);
  assert.equal(b.acquire(), false);
  a.release();
  assert.equal(b.acquire(), true);
  b.release();
  repo.close();
});
test("rate budget is shared across store users", () => {
  const repo = createRepository();
  assert.equal(repo.allow("test", 1, 60000), true);
  assert.equal(repo.allow("test", 1, 60000), false);
  repo.close();
});
test("server reset invalidates pending consent and clears server-owned history", () => {
  const repo = createRepository(),
    s = prepared(repo),
    token = s.confirmation.token;
  s.history = [{ role: "user", content: "old" }];
  s.persist();
  const response = res();
  createSessionHandler({
    getSession: createChatSessionStore({ repository: repo }),
    reset: true,
  })({ headers: { cookie: "caro_session=" + s.id }, secure: false }, response);
  const restored = session(repo, s.id);
  assert.equal(restored.history.length, 0);
  assert.notEqual(restored.requestId, s.requestId);
  assert.equal(confirmationMatches(restored, token), false);
  repo.close();
});
test("Russian summary and confirmation are generated in the selected language", () => {
  const reply = presentRequestStep("", full(), { language: "ru", company });
  assert.ok(reply.includes("Проверьте"));
  assert.ok(reply.includes("Отправить эту заявку"));
  assert.ok(!reply.includes("Mám žádost"));
});
function modelPayload() {
  return {
    safetyWarning: "",
    reply: "Děkuji.",
    language: "cs",
    priceQuoted: false,
    keepClosedDay: false,
    partsAction: "keep",
    oilPriceMode: "none",
    oilPriceRequests: [],
    oilPriceFollowUp: "",
    needsClarification: false,
    statusFollowUp: "",
    submissionAction: "none",
    intake: full(),
  };
}
test("runtime schema rejects extra properties, wrong enums and malformed nested intake", () => {
  const good = modelPayload();
  assert.equal(validateModelResponse(good), true);
  assert.equal(
    validateModelResponse({ ...good, submissionAction: "send_now" }),
    false,
  );
  assert.equal(validateModelResponse({ ...good, extra: true }), false);
  assert.equal(
    validateModelResponse({
      ...good,
      intake: { ...good.intake, customer: null },
    }),
    false,
  );
});
test("both price books, Prague date and durable price memory reach the model without network access", async () => {
  let params;
  const result = await getReply(
    "test",
    company,
    [],
    full(),
    undefined,
    false,
    async (p) => {
      params = p;
      return {
        status: "completed",
        output_text: JSON.stringify(modelPayload()),
      };
    },
    false,
    { priceMemory: [{ text: "Previously quoted 400 Kč" }] },
  );
  assert.equal(result.kind, "reply");
  assert.ok(params.instructions.includes("Europe/Prague"));
  assert.ok(params.instructions.includes("serviceParts"));
  assert.ok(params.instructions.includes("customerParts"));
  assert.ok(params.input[0].content.includes("Previously quoted 400 Kč"));
});
test("malformed or incomplete model replies are not exposed to customers", async () => {
  for (const response of [
    { status: "incomplete" },
    { status: "completed", output_text: "{}" },
    { status: "completed", output_text: "not JSON" },
  ]) {
    const result = await getReply(
      "test",
      company,
      [],
      full(),
      undefined,
      false,
      async () => response,
    );
    assert.equal(result.kind, "unavailable");
  }
});

// Calendar fixtures below are evaluated relative to this fixed Prague date.
import { beforeEach } from "node:test";
beforeEach(t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-20T08:00:00Z") });
});

test("runtime schema requires a string safetyWarning and accepts a safety-only reply", () => {
  const good=modelPayload();
  const missing={...good};delete missing.safetyWarning;
  assert.equal(validateModelResponse(missing),false);
  assert.equal(validateModelResponse({...good,safetyWarning:null}),false);
  assert.equal(validateModelResponse({...good,safetyWarning:false}),false);
  assert.equal(validateModelResponse({...good,reply:"",safetyWarning:"Nepokračujte v jízdě."}),true);
  assert.equal(validateModelResponse({...good,reply:"",safetyWarning:""}),false);
});
test("service preserves safetyWarning separately and includes it once in the reply",async()=>{
 const payload=modelPayload();payload.safetyWarning="Nepokračujte v jízdě.";
 const result=await getReply("Test",company,[],full(),undefined,false,async()=>({status:"completed",output_text:JSON.stringify(payload)}));
 assert.equal(result.kind,"reply");
 assert.equal(result.safetyWarning,payload.safetyWarning);
 assert.equal(result.text,payload.safetyWarning+"\n\n"+payload.reply);
});
