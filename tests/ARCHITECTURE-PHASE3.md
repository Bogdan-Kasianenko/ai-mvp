# Phase 3 review

Phase 2 checkpoint: 309d77f.
Production code, catalogue, dependency versions and existing test assertions are unchanged.
Phase 3 is left uncommitted for review.

## Reuse audit

| Repeated setup | Before | Shared implementation |
| --- | ---: | --- |
| Company JSON loading | 29 locations | fixtures/company.mjs |
| Standard provider payload builders | 5 files | fixtures/model-response.mjs |
| Complete oil intake builders | 3 files | fixtures/intake.mjs |
| Provider response envelopes | 3 files | helpers/fake-model.mjs |
| HTTP server lifecycle | 3 files | helpers/http-server.mjs |
| Temporary SQLite directory setup | 4 definitions in 3 files | helpers/temporary-repository.mjs |

These 47 setup locations share six small implementations (41 repeated implementations
consolidated). This is a count of setup patterns, not identical lines or removed tests.
Formatting shared defaults readably and adding documentation/evals increases total lines.

Examples: selected-materials, selected-parts-supply and mixed-parts share an oil draft;
vehicle-action, automatic-oil-service and tire-details share provider envelopes;
http, language and reload-recovery share server startup/shutdown;
rate-limits, atomic-limits and empty-session-lifecycle share temporary DB paths.
Scenario-specific inputs, invalid payloads, failure injection, tool sequences and expected
prices remain local. No generic mailer/clock or global harness was introduced.

## Validation

- Baseline: 37 test files, 472 passed, 0 failed/skipped, about 12.2 s.
- After company/model fixtures: 472 passed, about 14.4 s.
- After HTTP/model/storage helpers: 472 passed, about 10.6 s.
- Intake fixture consumers: 41 passed.
- Final npm test: 37 files, 472 passed, 0 failed/skipped, about 12.3 s.
- npm run test:browser: 30 passed, 0 failed/skipped, about 2.7 s.
- npm run eval: 22 valid scenarios; selected-id path checked.
- Offline smoke checks: fresh fixture objects and override isolation; eval runner with
  a mocked SDK and forbidden network; multi-turn history; saved reports; provider failure;
  missing key and unknown-id rejection. Generated smoke reports were removed.
- git diff --check: clean.

Live model quality was not evaluated. See evals/README.md for opt-in execution and review.
The runner operates at getReply, not the delivery/consent HTTP boundary. Existing
deterministic tests retain that coverage. Browser tests retain their VM/HTTP harness.

## Commands and scenarios

See README.md for structure and commands, and evals/scenarios.json for the 22 scenarios:
oil prices / own parts / mixed parts; tyre prices / missing details / history;
brake prices / braking failure; hours/address / replacement car;
unknown contact / unknown discount; topic switch; vehicle history / correction;
oil-pressure warning / overheated engine and driving / wrong fuel;
unknown vehicle; service intake / no consent; safety prompt injection.

Suggested commit:

    test: share focused fixtures and helpers and add isolated AI evals
