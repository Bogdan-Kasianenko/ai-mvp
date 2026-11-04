import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oilFiltersGuide } from "../../guides/oil-filters.mjs";
import { tiresGuide } from "../../guides/tires.mjs";
import { buildInstructions } from "../../instructions.mjs";
import { getReply } from "../../service.mjs";
import { emptyIntakeState } from "../../intake.mjs";
const company=JSON.parse(readFileSync(new URL("../../company.json",import.meta.url),"utf8"));
function state(operations=["oil_filters:engine_oil"]){
 const intake=emptyIntakeState();
 Object.assign(intake,{intent:"service_request",selectedOperations:operations,customerParts:false,oilFilterScopeReviewed:true,serviceId:"oil_filters",serviceOptionId:"engine_oil",requestedWork:"Výměna oleje a olejového filtru"});
 Object.assign(intake.vehicle,{brand:"Suzuki",model:"Swift",year:"2018",engine:"1,3 l",fuel:"benzín"});
 return intake;
}
function answer(request,intake,overrides={}){
 const value={safetyWarning:"",reply:"Jasně.",language:"cs",priceQuoted:false,replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction:"keep",oilPriceMode:"none",oilPriceRequests:[],tirePriceRequest:null,oilPriceFollowUp:"",keepClosedDay:false,needsClarification:false,statusFollowUp:"",intake:structuredClone(intake),submissionAction:"none",...overrides};
 const actions=request.text.format.schema.properties.guideActions?.properties;
 if(actions)value.guideActions=Object.fromEntries(Object.keys(actions).map(id=>[id,"keep"]));
 return {status:"completed",output:[],output_text:JSON.stringify(value)};
}
const load=ids=>({status:"completed",output:[{type:"function_call",name:"load_guides",call_id:"oil-guide-load",arguments:JSON.stringify({guideIds:ids})}]});

for(const activeGuides of [[],["tires"],["oilFilters"],["oilFilters","tires"]]){
 test("oil guide is included once only when enabled: "+JSON.stringify(activeGuides),()=>{
  const text=buildInstructions({company,priceBooks:{},currentPragueDate:"27. října 2026",activeGuides});
  assert.equal(text.split(oilFiltersGuide.instructions).length-1,activeGuides.includes("oilFilters")?1:0);
  assert.equal(text.split(tiresGuide.instructions).length-1,activeGuides.includes("tires")?1:0);
  const companyLine=text.split("\n").find(x=>x.startsWith("Firemní data: "));
  const supplied=JSON.parse(companyLine.slice("Firemní data: ".length));
  assert.deepEqual(supplied.services,company.services);
  assert.equal(Object.hasOwn(supplied.symptomGuide,"oilFilters"),false);
 });
}

test("first informational oil inquiry loads rules without selecting work",async()=>{
 const initial=emptyIntakeState();initial.intent="service_discussion";
 let calls=0;
 const result=await getReply("Jaké filtry měníte?",company,[],initial,undefined,false,async request=>{
  calls++;
  if(calls===1){
   assert.ok(!request.instructions.includes(oilFiltersGuide.instructions));
   assert.ok(request.tools[0].parameters.properties.guideIds.items.enum.includes("oilFilters"));
   return load(["oilFilters"]);
  }
  assert.ok(request.instructions.includes(oilFiltersGuide.instructions));
  assert.equal(request.tool_choice,"none");
  return answer(request,initial);
 });
 assert.equal(calls,2);assert.equal(result.kind,"reply");
 assert.deepEqual(result.activeGuides,["oilFilters"]);
 assert.deepEqual(result.intake.selectedOperations,null);
 assert.equal(result.intake.customerParts,null);
});

test("oil and tires can load together on their first message and become service-bound",async()=>{
 const initial=emptyIntakeState();const next=state(["oil_filters:engine_oil","tires:seasonal_tires"]);let calls=0;
 const result=await getReply("Chci olej a přezutí",company,[],initial,undefined,false,async request=>{
  calls++;if(calls===1)return load(["oilFilters","tires"]);
  assert.ok(request.instructions.includes(oilFiltersGuide.instructions));assert.ok(request.instructions.includes(tiresGuide.instructions));
  return answer(request,next);
 });
 assert.equal(result.kind,"reply");assert.equal(calls,2);assert.deepEqual(result.activeGuides,[]);
 assert.deepEqual(result.intake.selectedOperations,next.selectedOperations);
});

test("persisted selected work restores both guides without a temporary active-guide list",async()=>{
 const initial=state(["oil_filters:engine_oil","tires:seasonal_tires"]);let calls=0;
 const result=await getReply("16",company,[],initial,undefined,false,async request=>{
  calls++;
  assert.ok(request.instructions.includes(oilFiltersGuide.instructions));assert.ok(request.instructions.includes(tiresGuide.instructions));
  for(const id of ["oilFilters","tires"]){
   assert.deepEqual(request.text.format.schema.properties.guideActions.properties[id].enum,["keep"]);
   assert.ok(!request.tools[0].parameters.properties.guideIds.items.enum.includes(id));
  }
  return answer(request,initial);
 },false,{activeGuides:[]});
 assert.equal(result.kind,"reply");assert.equal(calls,1);assert.deepEqual(result.activeGuides,[]);
 assert.deepEqual(result.intake.vehicle,initial.vehicle);
});

test("server rejects clearing the oil guide while oil work is selected",async()=>{
 const initial=state();
 const result=await getReply("Jiná otázka",company,[],initial,undefined,false,async request=>{
  const response=answer(request,initial);const value=JSON.parse(response.output_text);value.guideActions.oilFilters="clear";response.output_text=JSON.stringify(value);return response;
 });
 assert.equal(result.kind,"unavailable");
});

test("removing oil preserves tires and omits oil instructions from the next request",async()=>{
 const initial=state(["oil_filters:engine_oil","tires:seasonal_tires"]),next=state(["tires:seasonal_tires"]);
 next.serviceId="tires";next.serviceOptionId="seasonal_tires";next.requestedWork="Přezutí dvou pneumatik";
 const removed=await getReply("Olej ruším, jen pneumatiky",company,[],initial,undefined,false,async request=>answer(request,next));
 assert.equal(removed.kind,"reply");
 const result=await getReply("16",company,[],removed.intake,undefined,false,async request=>{
  assert.ok(!request.instructions.includes(oilFiltersGuide.instructions));assert.ok(request.instructions.includes(tiresGuide.instructions));
  return answer(request,next);
 },false,{activeGuides:removed.activeGuides});
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.selectedOperations,["tires:seasonal_tires"]);
});

for (const ownOil of [false, true]) {
 test("adding oil to quoted tires preserves known details and prices only the new oil work: ownOil="+ownOil,async()=>{
  const initial=state(["tires:seasonal_tires"]);
  Object.assign(initial,{serviceId:"tires",serviceOptionId:"seasonal_tires",requestedWork:"Přezutí dvou pneumatik 16 palců ALU",preferredTime:"2099-10-27",additionalServicesReviewed:true});
  Object.assign(initial.customer,{name:"Test",email:"test@example.com"});
  const before=structuredClone(initial),next=structuredClone(initial);
  next.selectedOperations.push("oil_filters:engine_oil");
  Object.assign(next,{serviceId:"oil_filters",serviceOptionId:"engine_oil",requestedWork:initial.requestedWork+"; výměna oleje a olejového filtru",oilFilterScopeReviewed:true});
  next.partsOverrides.engineOil=ownOil?true:null;
  const history=[{role:"assistant",content:"Přezutí dvou pneumatik stojí 800 Kč. Mám žádost odeslat servisu?"}];
  let calls=0;
  const result=await getReply("Přidejte olej s filtrem, jiné filtry nechci",company,history,initial,undefined,false,async request=>{
   calls++;
   if(calls===1){assert.ok(!request.instructions.includes(oilFiltersGuide.instructions));assert.ok(request.instructions.includes(tiresGuide.instructions));return load(["oilFilters"]);}
   const server=JSON.parse(request.input[0].content.slice(request.input[0].content.indexOf("{")));
   assert.deepEqual(server.intake.vehicle,initial.vehicle);
   assert.deepEqual(server.serverContext.priceMemory,[{text:"Přezutí 800 Kč"}]);
   return answer(request,next,{replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction: "keep", vehicleFields: [], partsAction:"update",oilPriceMode:"automatic",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}],reply:"Doplním výměnu oleje a olejového filtru."});
  },false,{activeGuides:[],oilPriceMemory:[],priceMemory:[{text:"Přezutí 800 Kč"}]});
  assert.equal(result.kind,"reply");assert.equal(calls,2);
  assert.match(result.text,new RegExp("Výměna motorového oleje a olejového filtru \\| "+(ownOil?500:400)+" Kč"));
  assert.doesNotMatch(result.text,/800 Kč/);
  assert.deepEqual(result.intake.vehicle,initial.vehicle);assert.deepEqual(result.intake.customer,initial.customer);
  assert.equal(result.intake.preferredTime,initial.preferredTime);
  assert.deepEqual(result.intake.selectedOperations,next.selectedOperations);
  assert.equal(result.intake.oilFilterScopeReviewed,true);assert.deepEqual(initial,before);
 });
}
