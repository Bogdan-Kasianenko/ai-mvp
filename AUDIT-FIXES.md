# Repair pass — 15 October 2026

## Implemented

1. Replaced the accumulating prompt patches with one coherent instruction set.
   A service request starts intake directly; policy questions do not imply parts
   selection. Prices are conditional until selection, use the correct labor rate,
   and are remembered separately from the rolling message window. Contact wording
   is conversational; final sending consent stays separate.
2. Added a durable SQLite session and delivery journal, stable request/version
   identifiers and database leases. Status is session-owned and survives restart
   and optional-field changes. Identical drafts in unrelated sessions do not share
   status. Draft changes cannot reuse old consent.
3. Added durable delivery reservation, rejection vs uncertain-result handling,
   bounded SMTP waiting and late positive acknowledgement. Unknown outcomes block
   automatic resending, including an altered draft in the same conversation.
4. Preserved model answers and warnings instead of replacing them with a canned
   request question. Kept status facts server-controlled and preserved answers to
   additional questions in a status inquiry.
5. Unified intake readiness and missing fields. Explicitly unknown year can be
   skipped; contact cannot. Required-material jobs cannot skip parts selection.
6. Added parts choice, mileage and oil-change history to email contents.
7. Added HTTP message idempotency, session restoration and reset endpoints,
   obsolete-conversation checks, client response guards, larger total waiting
   budget and server-owned cache restoration.
8. Added per-IP/global rate limits, global concurrency cap, cookie/lease locking,
   cross-origin POST rejection and basic response headers.
9. Added runtime validation of the complete model output, not only JSON parsing.
10. Localized summaries and sending/status results for cs/sk/en/ru/uk/de. Other
    model languages retain an English server-message fallback.
11. Added FAQ Escape handling, keyboard focus outline and a soft bottom fade.
12. Retired unused semantic regex helpers and stale/live-default tests. Their
    originals are backed up outside the project in the Codex workspace under
    `caro-legacy-backup-2026-10-15`. `npm test` now runs only offline/mock tests.
13. Updated README, Node engine requirement, lockfile metadata and the page's
    description of server storage. `.env` was not read or modified.

## Verification

- JavaScript syntax checks and safe automated test suite.
- HTTP collection → review → price question → consent → send → status → reload →
  reset, with fake mail and fake model, including replay of the sending message.
- SQLite close/reopen: delivery remains recorded and is not sent twice.
- SMTP explicit refusal permits retry; ambiguous timeout blocks duplicates.
- Repository vulnerability audit: no known production dependency vulnerabilities
  reported by npm during this pass.
- No real OpenAI request and no real email were sent.

## Limits

The browser tool timed out connecting to the temporary loopback preview server,
so desktop/mobile rendering and real keyboard behavior were not visually certified.
That preview server was stopped. CSS/JS and the HTTP interface were checked.

The suite substitutes model replies; actual wording, interpretation of typos and
FAQ quality still require live conversational evaluation with test data. The
structured-output contract follows the official OpenAI documentation:
https://developers.openai.com/api/docs/guides/structured-outputs

SMTP has no universal exactly-once guarantee. Uncertain results remain uncertain
until positively acknowledged or checked by the service; the assistant does not
claim a booking or inbox receipt. The journal only covers sends after migration.
Multiple application hosts require a shared supported storage design; this SQLite
implementation supports processes using the same local database file.

No commit or push was performed in this repair pass.

## Audit item 3 follow-up — 16 October 2026

Verified that optional mileage changes preserve the delivery record and do not
overwrite its original snapshot or send another email. Found and fixed an
ambiguous status answer while an amended request was still awaiting consent:
the server now explicitly distinguishes the previously sent request from its
unsent changes, including incomplete amendments. Added this status in all six
supported server languages and supplied the distinction to the model context.

Regression tests cover mileage changes, an amended date, rejection of stale
consent, sending the updated snapshot after fresh consent, and Russian status
wording for incomplete amendments. All mail and model behavior in these tests
is substituted; no live email or OpenAI request is performed.

## Audit item 6 follow-up — 16 October 2026

Completed the missing Ukrainian, Slovak and German common error translations.
Localized chat input/confirmation validation, obsolete conversations, reused
message IDs, malformed JSON, oversized bodies, unsupported encoding, cross-origin
requests, API timeout/unavailability and generic processing failures using the
stored conversation language. Browser-side chat errors now receive the same
translated strings in session/reply responses and retain them across reloads.
The Czech website labels are unchanged; this pass concerns conversational and
chat error messages. Unsupported server-message languages still fall back to
English, as documented.

Added language.test.mjs: dictionary completeness and HTTP checks across all six
supported languages, using fake model behavior and no mail delivery. These checks
do not certify live model language detection or visual browser behavior.
# Audit follow-up: item 7 (2026-10-16)

Verified the existing request limits with five additional regression tests in
`rate-limits.test.mjs`: 30 model calls per IP per minute across new cookies and
database restart, 120 calls globally per minute across different IPs, at most
12 concurrent model calls, lock release after a model exception, and quota
renewal at the minute boundary. Rejected requests never reach the mock model.
No production-code change was needed for this item. All 54 tests pass using
mock model/mail implementations; no real API call or email was sent.

