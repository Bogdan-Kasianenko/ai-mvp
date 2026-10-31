import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyIntakeState } from "./intake.mjs";
import { renderAutomaticOilQuotes, renderOilQuotes } from "./oil-quotes.mjs";
const company=JSON.parse(readFileSync(new URL("./company.json",import.meta.url),"utf8"));
function draft(ids=["engine_oil"]){
 const state=emptyIntakeState();
 Object.assign(state,{intent:"service_request",selectedOperations:ids.map(id=>"oil_filters:"+id),customerParts:false,oilFilterScopeReviewed:true});
 return state;
}
test("automatic quote supplies the missing 400 Kč oil labor price",()=>{
 const result=renderAutomaticOilQuotes(company,draft());
 assert.match(result.text,/Výměna motorového oleje a olejového filtru \| 400 Kč/);
 assert.equal(result.records.length,1);assert.equal(result.records[0].source,"selected");
});
test("own oil changes only the oil operation to 500 Kč",()=>{
 const state=draft(["engine_oil","lpg_filter"]);state.partsOverrides.engineOil=true;
 const result=renderAutomaticOilQuotes(company,state);
 assert.match(result.text,/olejového filtru \| 500 Kč/);
 assert.match(result.text,/jednoho LPG filtru \| 400 Kč/);
});
test("all five selected filter operations retain independent server prices",()=>{
 const result=renderAutomaticOilQuotes(company,draft(["engine_oil","air_filter","cabin_filter","fuel_filter","lpg_filter"]));
 assert.deepEqual(result.records.map(x=>x.variants[0].priceFromKc),[400,200,200,400,400]);
});
test("information-only conversations or no selected oil work produce no proactive price",()=>{
 for(const intent of ["general","service_discussion"]){const state=draft();state.intent=intent;assert.deepEqual(renderAutomaticOilQuotes(company,state),{text:"",records:[]});}
 for(const selectedOperations of [null,[],["tires:seasonal_tires"]]){const state=draft();state.selectedOperations=selectedOperations;assert.equal(renderAutomaticOilQuotes(company,state).text,"");}
});
test("engine oil scope must be reviewed before automatic pricing",()=>{
 const state=draft();state.oilFilterScopeReviewed=false;
 assert.deepEqual(renderAutomaticOilQuotes(company,state),{text:"",records:[]});
});
test("a standalone non-oil filter does not require reviewing engine-oil filter scope",()=>{
 const state=draft(["air_filter"]);state.oilFilterScopeReviewed=false;
 assert.match(renderAutomaticOilQuotes(company,state).text,/200 Kč/);
});
test("unknown or partially specified oil/filter suppliers block automatic quotes",()=>{
 const state=draft();state.customerParts=null;
 assert.equal(renderAutomaticOilQuotes(company,state).text,"");
 state.partsOverrides.engineOil=true;
 assert.equal(renderAutomaticOilQuotes(company,state).text,"","A known own oil rate does not resolve who supplies the oil filter");
 state.partsOverrides.oilFilter=false;
 assert.match(renderAutomaticOilQuotes(company,state).text,/500 Kč/);
});
test("an unrelated service with unresolved materials does not block a complete oil quote",()=>{
 const state=draft();state.selectedOperations.push("brakes:brake_pads");state.customerParts=null;
 state.partsOverrides.engineOil=false;state.partsOverrides.oilFilter=false;
 assert.match(renderAutomaticOilQuotes(company,state).text,/400 Kč/);
});
test("already quoted unchanged prices are not repeated",()=>{
 const state=draft();const first=renderAutomaticOilQuotes(company,state);
 assert.deepEqual(renderAutomaticOilQuotes(company,state,first.records),{text:"",records:[]});
});
test("adding a filter quotes only the newly selected operation",()=>{
 const state=draft();const first=renderAutomaticOilQuotes(company,state);
 state.selectedOperations.push("oil_filters:cabin_filter");
 const next=renderAutomaticOilQuotes(company,state,first.records);
 assert.deepEqual(next.records.map(x=>x.optionId),["cabin_filter"]);
 assert.doesNotMatch(next.text,/olejového filtru/);assert.match(next.text,/kabinového filtru \| 200 Kč/);
});
test("changing supplier updates only the affected oil price once",()=>{
 const state=draft(["engine_oil","lpg_filter"]);const first=renderAutomaticOilQuotes(company,state);
 state.partsOverrides.engineOil=true;
 const changed=renderAutomaticOilQuotes(company,state,first.records);
 assert.deepEqual(changed.records.map(x=>x.optionId),["engine_oil"]);assert.match(changed.text,/500 Kč/);
 assert.equal(renderAutomaticOilQuotes(company,state,[...first.records,...changed.records]).text,"");
});
test("a previously shown comparison suppresses repeating its unchanged selected price",()=>{
 const state=draft();
 const prior=renderOilQuotes(company,state,[{optionId:"engine_oil",source:"compare"}],"requested");
 assert.equal(renderAutomaticOilQuotes(company,state,prior.records).text,"");
});
test("the oil labor price does not require a known engine volume and does not mutate input",()=>{
 const state=draft(),before=structuredClone(state),dataBefore=structuredClone(company);
 assert.equal(state.vehicle.engine,null);
 assert.match(renderAutomaticOilQuotes(company,state).text,/400 Kč/);
 assert.deepEqual(state,before);assert.deepEqual(company,dataBefore);
});
