import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { emptyIntakeState } from "./intake.mjs";
import { createRepository } from "./storage.mjs";

const SESSION_TTL = 24 * 60 * 60 * 1000;
export function draftFingerprint(intake) {
  return JSON.stringify({
    customerParts: intake.customerParts,
    serviceId: intake.serviceId,
    serviceOptionId: intake.serviceOptionId,
    requestedWork: intake.requestedWork,
    vehicle: intake.vehicle,
    problem: intake.problem,
    customer: intake.customer,
    preferredTime: intake.preferredTime,
  });
}
export function createChatSessionStore({
  now = Date.now,
  repository = createRepository(),
} = {}) {
  const active = new Map();
  return function getSession(request, response) {
    const token = String(request.headers.cookie ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("caro_session="))
      ?.slice(13);
    let session = active.get(token) ?? repository.load(token ?? "");
    if (session?.expiresAt <= now()) session = null;
    const created = !session;
    if (!session)
      session = {
        id: randomBytes(32).toString("hex"),
        requestId: randomUUID(),
        revision: 0,
        confirmation: null,
        history: [],
        intake: emptyIntakeState(),
        busy: false,
        expiresAt: now() + SESSION_TTL,
        language: "cs",
        priceMemory: [],
        responses: [],
        lastDelivery: null,
      };
    session.expiresAt = now() + SESSION_TTL;
    session.busy = Boolean(session.busy);
    if (!Object.hasOwn(session, "repository")) {
      const owner = randomUUID();
      Object.defineProperty(session, "repository", { value: repository });
      Object.defineProperty(session, "persist", {
        value: () => repository.save(session),
      });
      Object.defineProperty(session, "acquire", {
        value: () => {
          if (session.busy) return false;
          if (!repository.lock(session.id, owner)) return false;
          const current = repository.load(session.id);
          if (current) Object.assign(session, current);
          session.expiresAt = now() + SESSION_TTL;
          session.busy = true;
          active.set(session.id, session);
          return true;
        },
      });
      Object.defineProperty(session, "release", {
        value: () => {
          session.busy = false;
          try {
            repository.save(session);
          } finally {
            repository.unlock(session.id, owner);
            active.delete(session.id);
          }
        },
      });
    }
    if (created) {
      repository.cleanup();
      if (repository.sessionCount() >= 1000)
        throw Object.assign(new Error("Session capacity reached"), {
          status: 503,
        });
      repository.save(session);
    }
    response.cookie("caro_session", session.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: request.secure === true,
      path: "/api",
      maxAge: SESSION_TTL,
    });
    response.set("Cache-Control", "no-store");
    return session;
  };
}
let defaultStore;
export function getChatSession(request, response) {
  defaultStore ??= createChatSessionStore({
    repository: createRepository(
      fileURLToPath(new URL("./storage/caro.sqlite", import.meta.url)),
    ),
  });
  return defaultStore(request, response);
}
export function hasPendingConfirmation(session) {
  const p = session?.confirmation;
  return Boolean(
    p &&
    p.requestId === session.requestId &&
    p.revision === session.revision &&
    p.expiresAt > Date.now() &&
    p.fingerprint === draftFingerprint(session.intake),
  );
}
export function confirmationMatches(session, token) {
  return (
    hasPendingConfirmation(session) &&
    typeof token === "string" &&
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(session.confirmation.token, "hex"),
    )
  );
}
export function prepareConfirmation(session) {
  session.confirmation = {
    token: randomBytes(32).toString("hex"),
    requestId: session.requestId,
    revision: session.revision,
    fingerprint: draftFingerprint(session.intake),
    intake: structuredClone(session.intake),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  return session.confirmation.token;
}
