# Phase 2 test cleanup — 2026-11-04

Phase 1 commit: `c66472f`. Earlier checkpoint: `941a6a4`.
All Phase 2 code changes are confined to tests. Production code, dependencies,
test discovery, shared helpers, fixtures and eval infrastructure are unchanged.

## Verification

| Run | Files | Cases | Passed | Failed | Skipped | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline in restricted sandbox | 41 | 521 | 503 | 18 | 0 | 14.4 s |
| Baseline with loopback access | 41 | 521 | 507 | 14 | 0 | 12.0 s |
| After presentation and guide cleanup | 40 | 490 | 490 | 0 | 0 | 12.3 s |
| Final, with loopback access | 37 | 472 | 472 | 0 | 0 | 11.0 s |

Command: `npm.cmd test -- --test-reporter=tap` (equivalent discovery to
`node --test`). Four baseline HTTP failures were sandbox connection failures,
not product failures. Full HTTP runs use ephemeral loopback servers; AI replies
and mail delivery remain fake. No test was skipped to obtain a green run.

Targeted runs: presentation 54/54; guides 98/98; product plus affected workflow
and safety files 273/273; safety, browser and oil quotes 103/103.
Durations are observations, not a performance benchmark.

## Removed files and retained coverage

| Former file | Decision and coverage location |
| --- | --- |
| `integration/oil-pricing-guide-scope.test.mjs` | Remove prompt-layout checks: exact headings, wording and a minimum block length were migration-era source organization checks. Conditional inclusion remains in `oil-guide`; actual pricing/comparison/state behavior remains in oil quotes, parts choice and service tests. |
| `product/selected-operations.test.mjs` | Move the unselected-description, unknown-operation and legacy-missing-list scenarios into `selected-parts-supply`. Keep its existing added-filter supplier scenario and add the missing-field assertion from the duplicate. |
| `product/fixture-contract.test.mjs` | Move Sunday/forged `keepClosedDay` consent regression to `appointment-validation`, including its fixed clock. Merge required/type checks into `workflow-regression` schema validation. Engine/skip/supplier gating remains in `selected-materials`, `selected-parts-supply` and `mixed-parts`. |
| `product/automatic-oil-quotes.test.mjs` | Move the ten remaining eligibility, scope and memory tests into `oil-quotes`. Keep local existing test builders; no shared fixture abstraction was introduced. |

## Duplicate and low-value removal ledger

The net reduction is 49 runner cases. This includes replacements and retained
cases moved between files; it is not a claim that 49 independent risks vanished.

| Group | Removed repetition | Retained protection |
| --- | --- | --- |
| Presentation | Four price-order tests in `operations-action`; the last combined-price/safety test in tire integration | `reply-lead` covers warning/lead/prices/body/follow-up order. Tire integration covers material/price pairing, clarification, question placement and repair; tire details covers explicit unknown material. |
| Guide composition | Five oil-option binding registrations, the oil/tire composition getter test, tire binding and duplicate 16-inch arithmetic tests | `guide-registry` checks actual service-to-guide routing, including towing and simultaneous work. Oil/tire flows exercise real bindings. `tire-prices` retains quantity and diameter boundaries. |
| Guide continuations | Five no-start mock phrases become one; three jerking mock phrases become one | Those mocks always supplied the same `keep` decision. The surviving cases assert state, history and bounded calls; they do not claim natural-language understanding. |
| Guide lifecycle | Single-guide schema isolation, jerking property equality and a repeated real two-guide load/clear scenario | Multi-guide schema isolation in `guide-registry`; real two-guide SQLite restart/clear test in `jerking-guide`. |
| Old oil-guide regressions | Own-oil/LPG price after guide extraction, repeated short continuation, repeated lost-engine scenario | Mixed-parts and automatic service prices; persisted service-bound guide flow; vehicle-action tests inject missing/invented fields and check restoration. |
| Low-level mock path | “ordinary oil request stays one model call without guide” | The old name implied product routing although the mock simply returned a reply. Current first-oil information and booking flows load and consume the oil guide. |
| Materials | Duplicate added-filter test; six ordinary multilingual descriptions with the same structured operations | One added-filter transition and the stronger six-language unselected-filter-description invariant in `selected-parts-supply`. |
| Intake | Simple customerParts normalization round-trip; repeated engine/skip test from fixture-contract | Explicit supplier changes and preservation in `parts-choice-flow`; material and engine rules in selected-materials/selected-parts-supply/mixed-parts. |
| Oil prices | Standalone first 400 quote, repeated own-oil/LPG quote, simple unchanged-price repeat, repeated ordinary service reply | First quote/source assertions merged into the no-engine/mutation test; mixed-parts and service tariff checks; changed-price memory plus real handler/reload deduplication. |
| Schema | Dedicated keepClosedDay and statusFollowUp shape-only tests | Required-field and invalid-type assertions merged into existing runtime schema validation. |
| Limits and locks | Trivial repository budget repeat, duplicate rejected-bucket rollback, successful lock test using a fake repository | Real quota boundary and atomic rollback tests; SQL insertion-failure rollback; HTTP/model counters; durable two-store exclusion and failure-recovery lock tests. |

## Obsolete assertions and implementation coupling

- Removed the CSS source-layout test. Contiguous blocks, exact selector spelling,
  rule counts and comments do not certify the browser layout. Existing browser
  critical-path tests are unchanged; this cleanup does not add visual testing.
- Tire presentation now checks material-to-amount pairing, row count, quantity,
  diameter, language and ordering without requiring the previous full row label.
  Expected amounts remain independent constants, not renderer-generated values.
- Empty text is rejected only when no tire table is requested. A separate
  integration case checks that a valid table-only response produces customer
  output. Individual text fields are tested with the price requests disabled.
- Removed the obsolete “unconfirmed brake prices” check against company.json
  placeholder fields. Its replacement checks all five actual brake tariffs via
  getPriceQuote for service and customer-supplied parts, including labor-only kind.
- Prompt composition tests retain guide inclusion and supplied data assertions,
  but no longer pin editorial headings or exact instruction sentences.
- Registry checks assert service routing instead of a fixed list of registry keys.
- Mixed-part prompt data is parsed and compared as values instead of matching
  JSON property order and serialization fragments.
- Chat IP/global quota tests now use already-created cookies. The IP test alternates
  two cookies and reopens SQLite; the global test uses different IPs with one cookie.
  They cannot pass merely because the session-creation quota rejects the request.
  Dedicated session-creation and quota persistence tests remain unchanged.

## Critical coverage retained

- Warnings survive prices, review and invalid/closed dates; safety-only replies.
- Guide load/keep/clear, independent topics, tool validation and bounded loops.
- Vehicle/work/material state, partial updates, cancellation, history, reload,
  reset, multi-tab updates and first-message races.
- Price quantities, rim interval boundaries, supplier tariffs, unknown prices,
  company-policy true/false/null and replacement-vehicle wishes.
- Required intake, valid contact, dates and Prague midnight; draft-bound consent,
  foreign/stale tokens and amended-request status.
- Duplicate delivery protection, SQLite restart, explicit SMTP rejection and
  uncertain delivery outcomes. No claim of new late-ACK coverage is made.
- HTTP workflow, errors, origin/body validation, private-file protection,
  resource limits, transaction rollback and lock recovery.
- Legacy guide/state/deadline migrations: retained because production still
  supports those persisted formats.

Existing VM-based browser harnesses remain: replacing them with a new browser or
fixture framework is outside this phase. Mock routing tests do not certify live
model interpretation, and there is no new eval framework.

Phase 2 is left uncommitted for review. Suggested commit message:
`test: remove redundant cases and refresh behavioral assertions`.
