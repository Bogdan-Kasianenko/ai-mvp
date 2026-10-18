# Caro — autoservice assistant demo

## Run

Requires Node.js **22.13+** (Node 24 recommended). No database package or separate
database server is needed: persistence uses Node's built-in SQLite module.

Configure `.env` using `.env.example`. Use a Google **app password**, not the
account password. Keep all credentials on the server. Do not commit `.env`.

```powershell
npm.cmd install
npm.cmd start
```

Open http://127.0.0.1:3000. Restart the existing server after changing code or
environment variables, then reload the page. The server listens on loopback by
default. Do not expose it publicly merely by changing the listen address.

## How it works

- `instructions.mjs` contains the conversation rules in one place. `service.mjs`
  calls the configured OpenAI model, supplies both price books, the Prague date,
  server-owned intake/history and remembered price quotations, and validates the
  structured response before using it. Messages are sent with `store: false`.
- `pricing.mjs` is the price source. Standard labor is 850 Kč/h; customer-supplied
  parts use 1,000 Kč/h. An oil/oil-filter change starts at 400/500 Kč for labor;
  each air/cabin filter starts at 200/300 Kč. Fixed services keep fixed prices.
  Materials are not estimated. The catalog intentionally rounds starting labor
  amounts down to hundreds of Kč; these are advertised starting prices.
- `intake.mjs` validates state and defines the same required fields used by the
  sending gate. Engine, mileage and oil-change history are optional. An explicitly
  unknown year can be skipped. A valid name/contact, vehicle brand/model, requested
  work and preferred time remain required. Material jobs require a parts choice.
- `chat-session.mjs` / `storage.mjs` keep conversations in
  `storage/caro.sqlite`. The cookie is HttpOnly and SameSite=Strict. Client-supplied
  history and intake are never authoritative. Conversations expire after 24 hours
  of inactivity; expired sessions are removed during subsequent store activity.
  A separate delivery journal remains to prevent duplicates. It includes request
  snapshots and therefore customer contact details; restrict access to `storage/`.
  The database, its WAL files and credentials are ignored by Git and are never
  served by the public file handler. Keep the same storage directory on restart.
- `chat-route.mjs` coordinates questions, status, changes and explicit consent.
  A short-lived token binds consent to the reviewed server draft and revision.
  Changing the draft requires a new review. Questions while reviewing receive a
  normal answer. Optional bookkeeping does not itself invalidate consent.
- `request-flow.mjs` reserves delivery durably before contacting SMTP. A stable
  request/version identifier prevents duplicate confirmations, including after a
  restart and across processes sharing the SQLite file. An explicit SMTP refusal
  can be retried. An uncertain result is **not** automatically retried: SMTP cannot
  guarantee exactly-once delivery. A late positive acknowledgement updates the
  journal. Otherwise the service must check receipt. Mail acceptance does not
  confirm an appointment or guarantee inbox delivery.
- `mailer.mjs` includes the full requested work, parts choice, car, mileage,
  symptoms, last oil change and contact information. SMTP has bounded waits.
- `public/app.js` restores authoritative state and consent after reload, assigns
  message IDs, rejects obsolete responses, and synchronizes conversation resets.
  Local storage is only a display cache. FAQ titles stay fixed while questions
  scroll; Escape closes the menu and returns focus to its trigger.
- Server summaries/status messages support Czech, Slovak, English, Russian,
  Ukrainian and German. Other model reply languages use English server messages
  as a fallback. AI message understanding does not depend on keyword lists.
- Per-IP/global request budgets and a shared concurrent-request cap protect API
  usage. Cookie/lease checks serialize a conversation across server processes.
  Cross-origin browser POSTs are rejected.

## Tests

```powershell
npm.cmd test
```

The default suite uses fake AI replies and fake mail delivery. It does **not**
load `.env`, call OpenAI or send email. HTTP tests use an ephemeral loopback port
and close it. SQLite restart tests use disposable temporary databases.

Coverage includes consent forgery, stale/foreign tokens, changed drafts,
repeated HTTP messages, concurrency, persistent sending state, SMTP failure and
uncertainty, language templates, intake requirements, prices, schema validation,
email contents, restoration and reset.

After automated tests, verify real conversations in Czech/Russian with test
data, and inspect desktop/mobile layout. Mock tests cannot certify model wording
or visual layout. Read `AUDIT-FIXES.md` for this pass and its verification limits.

The old memory-only server cannot retroactively provide delivery records for
emails sent before this migration. New durable records begin with this version.
