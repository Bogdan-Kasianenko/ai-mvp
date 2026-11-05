# Tests

- npm test: all deterministic product, safety, integration, browser and compatibility tests.
- npm run test:browser: the existing browser critical-path subset.
- npm run eval: offline validation of the separate AI scenario catalogue.
- npm run eval -- --live: optional, paid real-model runs requiring human review.

Browser tests use the existing VM/browser harness and local HTTP checks; they are not
a new Playwright or real-browser automation suite. HTTP tests require loopback access.
No deterministic test should call a real AI or mail provider.

## Structure

    tests/
      product/        # prices, routing state, intake and service behavior
      safety/         # security, quotas, locks and safety state
      integration/    # HTTP, persistence, guide orchestration and regressions
      browser/        # first message, history and reload
      compatibility/  # existing stored-session migration
      fixtures/
        company.mjs
        intake.mjs
        model-response.mjs
      helpers/
        model-response.mjs
        fake-model.mjs
        http-server.mjs
        temporary-repository.mjs
      evals/
        scenarios.json
        run.mjs
        README.md

Fixtures create fresh mutable data. createTestCompany loads the shipped catalogue,
not a second copy of prices; expected values stay in tests. Company overrides replace
top-level fields. createOilServiceIntake merges only vehicle/customer/partsOverrides
and replaces arrays. createModelResponse accepts explicit top-level overrides and
does not manufacture guide actions; fakeModelResponse adds provider metadata.

Keep service choices, expected outcomes, malformed payloads and tool sequences visible
in the test. Reuse helpers only for genuinely repeated mechanics. temporaryRepository
owns a temporary directory, while tests explicitly own/close SQLite connections.
Always remove the directory in finally after closing connections. Await server.close()
in finally for HTTP fixtures.

No shared mailer or clock abstraction was added: existing local stubs/mocks have
different lifecycle and failure semantics and are already small. Do not unify them
just to obtain a symmetrical folder layout.
