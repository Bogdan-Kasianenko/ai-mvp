import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { live: { type: "boolean" }, id: { type: "string" } },
});
const scenarios = JSON.parse(readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"));
const ids = new Set();
if (!Array.isArray(scenarios) || scenarios.length === 0) throw new Error("Empty eval catalogue");
for (const scenario of scenarios) {
  if (!scenario.id || ids.has(scenario.id) || !scenario.category ||
      !["critical", "high"].includes(scenario.priority) ||
      !Array.isArray(scenario.messages) || !scenario.messages.length ||
      !scenario.messages.every(x => typeof x === "string" && x.trim()) ||
      !Array.isArray(scenario.expected?.criteria) || !scenario.expected.criteria.length ||
      !scenario.expected.criteria.every(x => typeof x === "string" && x.trim())) {
    throw new Error("Invalid or duplicate scenario: " + scenario.id);
  }
  ids.add(scenario.id);
}
const selected = values.id ? scenarios.filter(x => x.id === values.id) : scenarios;
if (!selected.length) throw new Error("Unknown scenario id: " + values.id);
console.log(`Validated ${scenarios.length} scenarios; selected ${selected.length}.`);
if (!values.live) {
  for (const scenario of selected) console.log(`${scenario.id}: ${scenario.category}`);
  console.log("Catalogue validation only. No AI behavior was evaluated. See tests/evals/README.md.");
} else {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Set OPENAI_API_KEY explicitly for --live");
  const [{ default: OpenAI }, { getReply }, { emptyIntakeState }] = await Promise.all([
    import("openai"), import("../../service.mjs"), import("../../intake.mjs"),
  ]);
  const companyText = readFileSync(new URL("../../company.json", import.meta.url), "utf8");
  const company = JSON.parse(companyText);
  const hash = text => createHash("sha256").update(text).digest("hex");
  const client = new OpenAI({ timeout: 20000, maxRetries: 0 });
  const results = [];
  const directory = new URL("./results/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  const filename = new URL(new Date().toISOString().replaceAll(":", "-") + ".json", directory);
  const report = {
    startedAt: new Date().toISOString(), boundary: "getReply (no HTTP or email)",
    companySha256: hash(companyText), scenariosSha256: hash(JSON.stringify(scenarios)),
    verdict: "pending-human-review", results,
  };
  const save = () => writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
  save();
  for (const scenario of selected) {
    let intake = emptyIntakeState();
    const history = [];
    const context = { activeGuides: [], oilPriceMemory: [], priceMemory: [] };
    const result = { id: scenario.id, expected: scenario.expected, verdict: "pending-human-review", turns: [] };
    results.push(result);
    for (const message of scenario.messages) {
      const calls = [];
      let reply;
      try {
        reply = await getReply(message, structuredClone(company), history, intake, undefined, false,
        async (request, options) => {
          const call = { model: request.model, instructionsSha256: hash(request.instructions ?? "") };
          calls.push(call);
          const response = await client.responses.create(request, options);
          call.usage = response.usage;
          call.tools = (response.output ?? []).filter(x => x.type === "function_call")
            .map(({ name, arguments: args }) => ({ name, arguments: args }));
          return response;
        }, false, context);
      } catch (error) {
        reply = { kind: "execution_error", error: { name: error.name, code: error.code } };
      }
      result.turns.push({ message, calls, reply });
      save();
      if (reply.kind !== "reply") {
        result.verdict = "execution-failed";
        process.exitCode = 1;
        break;
      }
      intake = reply.intake;
      context.activeGuides = reply.activeGuides ?? [];
      context.oilPriceMemory.push(...(reply.oilPriceRecords ?? []));
      if (reply.priceQuoted) context.priceMemory.push({
        serviceId: intake.serviceId, serviceOptionId: intake.serviceOptionId,
        requestedWork: intake.requestedWork, customerParts: intake.customerParts,
        partsOverrides: structuredClone(intake.partsOverrides), text: reply.text.slice(0, 2500),
      });
      history.push({ role: "user", content: message }, { role: "assistant", content: reply.text });
    }
    save();
    console.log(scenario.id + ": " + result.verdict);
  }
  console.log("Review criteria against every turn in: " + fileURLToPath(filename));
  console.log("Successful execution is NOT an AI quality pass.");
}
