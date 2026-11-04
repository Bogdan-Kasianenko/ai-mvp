import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, validateModelResponse } from "../../intake.mjs";
import { renderAutomaticOilQuotes } from "../../oil-quotes.mjs";

const company = JSON.parse(readFileSync(new URL("../../company.json", import.meta.url), "utf8"));
const five = ["engine_oil", "air_filter", "cabin_filter", "fuel_filter", "lpg_filter"].map(id => "oil_filters:" + id);
function state(operations = five) {
  const value = emptyIntakeState();
  Object.assign(value, {intent:"service_request", selectedOperations:[...operations], serviceId:"oil_filters", serviceOptionId:"engine_oil", customerParts:false, oilFilterScopeReviewed:true});
  Object.assign(value.vehicle, {brand:"Suzuki", model:"Swift", year:"2018", engine:"1,3 l", fuel:"benzín + LPG"});
  if(operations.includes("tires:seasonal_tires")) value.tires={optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"};
  return value;
}
function payload(next, extra = {}) {
  return {safetyWarning:"", reply:"", language:"cs", priceQuoted:false, replyLead: "Jasně, materiál zajistí servis.", tireUpdate: {reset:false,fields:[]}, operationsAction:"keep", vehicleAction:"keep", vehicleFields: [], partsAction:"keep", oilPriceMode:"none", oilPriceRequests:[], tirePriceRequest:null, oilPriceFollowUp:"", keepClosedDay:false, needsClarification:false, statusFollowUp:"", intake:structuredClone(next), submissionAction:"none", ...extra};
}
async function ask(initial, value, context = {}) {
  return getReply("Test", company, [], initial, undefined, false, async request => {
    const answer = structuredClone(value);
    const actions = request.text.format.schema.properties.guideActions?.properties;
    if (actions) answer.guideActions = Object.fromEntries(Object.keys(actions).map(id => [id,"keep"]));
    return {status:"completed", output:[], output_text:JSON.stringify(answer)};
  }, false, context);
}
for (const proposed of [null, [], ["other"], ["oil_filters:engine_oil"]]) {
  test("keep preserves every selected operation despite a corrupted proposed list: " + JSON.stringify(proposed), async () => {
    const initial = state(), next = structuredClone(initial);
    next.selectedOperations = proposed;
    const result = await ask(initial, payload(next));
    assert.equal(result.kind, "reply");
    assert.deepEqual(result.intake.selectedOperations, five);
    assert.deepEqual(initial.selectedOperations, five);
  });
}
test("the company-specific schema rejects an invented operation ID", async () => {
  const initial = state(), next = structuredClone(initial);
  next.selectedOperations = ["oil_filters:engine_oil", "oil_filters:typo"];
  const result = await ask(initial, payload(next));
  assert.equal(result.kind, "unavailable");
  assert.deepEqual(initial.selectedOperations, five);
});
test("recovery replaces a mistaken other ID and restores only explicitly known vehicle and tire details", async () => {
  const initial = state(["oil_filters:engine_oil", "other"]);
  initial.vehicle.engine = null;
  const next = structuredClone(initial);
  next.selectedOperations = ["oil_filters:engine_oil", "tires:seasonal_tires"];
  next.vehicle.engine = "1,3 l";
  next.tires = {optionId:"seasonal_tires",quantity:2,rimDiameter:17,material:"unknown"};
  let modelInput;
  const result = await getReply("Obnovte aktuální žádost, ale neodesílejte ji", company,
    [{role:"user",content:"Suzuki Swift 2018, benzín, objem 1,3 l. Přidejte přezutí dvou předních pneumatik 17 palců, materiál ráfků neznám."}],
    initial, undefined, false, async request => {
      modelInput = request.input;
      const answer = payload(next,{operationsAction:"replace",vehicleAction:"update",vehicleFields:["engine"],tireUpdate:{reset:false,fields:["optionId","quantity","rimDiameter","material"]}});
      const actions = request.text.format.schema.properties.guideActions?.properties;
      if (actions) answer.guideActions = Object.fromEntries(Object.keys(actions).map(id => [id,"keep"]));
      return {status:"completed",output:[],output_text:JSON.stringify(answer)};
    });
  assert.equal(result.kind,"reply");
  assert.deepEqual(result.intake.selectedOperations,next.selectedOperations);
  assert.equal(result.intake.vehicle.engine,"1,3 l");
  assert.equal(result.intake.vehicle.brand,"Suzuki");
  assert.deepEqual(result.intake.tires,next.tires);
  assert.equal(result.intake.pendingDetails.length,0);
  const serverData=JSON.parse(modelInput[0].content.slice(modelInput[0].content.indexOf("{") ));
  assert.equal(serverData.recoveryContext.operations,true);
  assert.deepEqual(serverData.recoveryContext.missingVehicleFields,["engine"]);
});
test("keep restores the operation list before own-oil overrides are normalized", async () => {
  const initial = state(), next = structuredClone(initial);
  next.selectedOperations = ["other"]; next.partsOverrides.engineOil = true;
  const result = await ask(initial, payload(next, {partsAction:"update"}));
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, five);
  assert.equal(result.intake.partsOverrides.engineOil, true);
  assert.match(result.text, /olejového filtru \| 500 Kč/);
  assert.match(result.text, /palivového filtru \| 400 Kč/);
  assert.match(result.text, /jednoho LPG filtru \| 400 Kč/);
});
test("add merges and deduplicates work without discarding omitted old services", async () => {
  const initial = state(), next = state(["tires:seasonal_tires", "oil_filters:engine_oil"]);
  const result = await ask(initial, payload(next, {tireUpdate: {reset:false,fields:[]}, operationsAction:"add"}));
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, [...five, "tires:seasonal_tires"]);
});
test("replace permits explicit removal and does not restore the removed filters", async () => {
  const initial = state(), next = state(five.slice(0,3));
  const result = await ask(initial, payload(next, {tireUpdate: {reset:false,fields:[]}, operationsAction:"replace"}));
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, five.slice(0,3));
  assert.doesNotMatch(result.text, /palivového filtru|LPG filtru/);
});
test("replace permits cancellation with an empty operation list", async () => {
  const initial = state(), next = state([]); next.intent="general";
  const result = await ask(initial, payload(next, {tireUpdate: {reset:false,fields:[]}, operationsAction:"replace"}));
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, []);
  assert.equal(result.oilPriceRecords.length, 0);
});
test("a legacy null list can be reconstructed rather than frozen", async () => {
  const initial = emptyIntakeState(), next = state(["oil_filters:engine_oil"]);
  const result = await ask(initial, payload(next, {tireUpdate: {reset:false,fields:[]}, operationsAction:"replace"}));
  assert.equal(result.kind, "reply");
  assert.deepEqual(result.intake.selectedOperations, next.selectedOperations);
});
test("response schema requires operationsAction and rejects invalid actions", () => {
  const value=payload(state()); assert.equal(validateModelResponse(value),true);
  const missing=structuredClone(value); delete missing.operationsAction;
  assert.equal(validateModelResponse(missing),false);
  for(const action of [null, true, "update", "merge", {}, []]) assert.equal(validateModelResponse({...value,tireUpdate: {reset:false,fields:[]}, operationsAction:action}),false);
});
test("reaction precedes server intro and table, with one follow-up after prices", async () => {
  const initial=state(["oil_filters:engine_oil"]);
  const result=await ask(initial,payload(initial,{oilPriceMode:"requested",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}],oilPriceFollowUp:"Jaký termín Vám vyhovuje?"}));
  assert.equal(result.kind,"reply");
  const sequence=["Jasně, materiál zajistí servis.","Tady máte přehled počátečních cen za práci:","| Úkon |", "400 Kč", "Částky jsou pouze za práci.","Jaký termín Vám vyhovuje?"];
  const positions=sequence.map(text=>result.text.indexOf(text));
  assert.ok(positions.every((pos,i)=>pos>=0&&(!i||pos>positions[i-1])));
  assert.equal(result.text.split(sequence[0]).length-1,1);
  assert.equal(result.text.split(sequence[1]).length-1,1);
});
test("unknown rims yield both prices without a clarification block and after the reaction", async () => {
  const initial=state(["tires:seasonal_tires"]);
  const result=await ask(initial,payload(initial,{replyLead:"Materiál ráfků upřesní servis při převzetí.",tirePriceRequest:{optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"},oilPriceFollowUp:"Jaký termín Vám vyhovuje?"}));
  assert.equal(result.kind,"reply"); assert.equal(result.needsClarification,false);
  assert.match(result.text,/Plechové \| 725 Kč/);assert.match(result.text,/Hliníkové \(ALU\) \| 800 Kč/);
  assert.ok(result.text.indexOf("Materiál ráfků")<result.text.indexOf("Přezutí pneumatik"));
  assert.ok(result.text.indexOf("800 Kč")<result.text.indexOf("Jaký termín"));
});
test("a question accidentally placed in reply stays after both price tables without 502", async () => {
  const initial=state(["oil_filters:engine_oil","tires:seasonal_tires"]);
  const result=await ask(initial,payload(initial,{reply:"Jaký termín Vám vyhovuje?",oilPriceMode:"requested",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}],tirePriceRequest:{optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"}}));
  assert.equal(result.kind,"reply");assert.ok(result.text.indexOf("Jaký termín")>result.text.indexOf("800 Kč"));
});
test("safety warning remains before the reaction and prices", async () => {
  const initial=state(["oil_filters:engine_oil"]);
  const result=await ask(initial,payload(initial,{safetyWarning:"Motor nestartujte.",oilPriceMode:"requested",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}]}));
  assert.equal(result.kind,"reply");assert.ok(result.text.startsWith("Motor nestartujte.\n\nJasně"));
});
test("unchanged oil price memory suppresses the intro as well as the table", async () => {
  const initial=state(["oil_filters:engine_oil"]);
  const result=await ask(initial,payload(initial),{oilPriceMemory:renderAutomaticOilQuotes(company,initial).records});
  assert.equal(result.kind,"reply");assert.equal(result.text,"Jasně, materiál zajistí servis.");
});
