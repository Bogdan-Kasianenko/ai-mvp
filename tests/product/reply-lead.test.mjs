import { createTestCompany } from "../fixtures/company.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, validateModelResponse } from "../../intake.mjs";

const company = createTestCompany();
function state(){
 const value=emptyIntakeState();
 Object.assign(value,{intent:"service_request",selectedOperations:["oil_filters:engine_oil","tires:seasonal_tires"],serviceId:"oil_filters",serviceOptionId:"engine_oil",customerParts:false,oilFilterScopeReviewed:true});
 value.tires={optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"};return value;
}
function payload(extra={}){
 return {safetyWarning:"",replyLead:"Jasně, materiál zajistí servis.",reply:"",language:"cs",priceQuoted:false,tireUpdate: {reset:false,fields:[]}, operationsAction:"keep",vehicleAction:"keep", vehicleFields: [],partsAction:"keep",oilPriceMode:"requested",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}],tirePriceRequest:{optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"},oilPriceFollowUp:"Ještě prosím uveďte své jméno.",keepClosedDay:false,needsClarification:false,statusFollowUp:"",intake:state(),submissionAction:"none",...extra};
}
async function ask(value,repair=null){
 let calls=0;
 const result=await getReply("Ano",company,[],state(),undefined,false,async request=>{
  const answer=structuredClone(++calls===1||!repair?value:repair);
  const actions=request.text.format.schema.properties.guideActions?.properties;
  if(actions)answer.guideActions=Object.fromEntries(Object.keys(actions).map(id=>[id,"keep"]));
  return {status:"completed",output:[],output_text:JSON.stringify(answer)};
 });
 return {result,calls};
}
for(const [language,request] of Object.entries({cs:"Ještě prosím uveďte své jméno.",sk:"Napíšte svoje meno.",en:"Please provide your name.",ru:"Напишите своё имя.",uk:"Напишіть своє ім’я.",de:"Bitte nennen Sie Ihren Namen."})){
 test("lead is before prices and an imperative body is after both tables: "+language,async()=>{
  const value=payload({language,reply:request,oilPriceFollowUp:""});
  const {result,calls}=await ask(value);
  assert.equal(result.kind,"reply");assert.equal(calls,1);
  assert.ok(result.text.startsWith(value.replyLead+"\n\n"));
  const priceEnd=result.text.lastIndexOf(" Kč");
  assert.ok(priceEnd>0);assert.ok(result.text.indexOf(request)>priceEnd);
 });
}
test("full response order is safety, reaction, intro, both tables, explanation and follow-up",async()=>{
 const value=payload({safetyWarning:"Motor nestartujte.",reply:"Materiál ráfků upřesní servis při převzetí."});
 const {result}=await ask(value);assert.equal(result.kind,"reply");
 const sequence=[value.safetyWarning,value.replyLead,"400 Kč","725 Kč","800 Kč",value.reply,value.oilPriceFollowUp];
 const positions=sequence.map(x=>result.text.indexOf(x));
 assert.ok(positions.every((p,i)=>p>=0&&(!i||p>positions[i-1])));
 for(const text of [value.replyLead,value.oilPriceFollowUp])assert.equal(result.text.split(text).length-1,1);
});
test("lead-only, follow-up-only and safety-only provider replies are valid",()=>{
 for(const field of ["replyLead","reply","oilPriceFollowUp","safetyWarning"]){
  const value=payload({replyLead:"",reply:"",oilPriceFollowUp:"",safetyWarning:"",tirePriceRequest:null,oilPriceMode:"none",oilPriceRequests:[],[field]:"Text"});
  assert.equal(validateModelResponse(value),true,field);
 }
 assert.equal(validateModelResponse(payload({replyLead:"",reply:"",oilPriceFollowUp:"",safetyWarning:"",tirePriceRequest:null,oilPriceMode:"none",oilPriceRequests:[]})),false);
});
test("replyLead is required and must be a string",()=>{
 const value=payload();const missing=structuredClone(value);delete missing.replyLead;
 assert.equal(validateModelResponse(missing),false);
 for(const invalid of [null,4,{},[]])assert.equal(validateModelResponse({...value,replyLead:invalid}),false);
});
test("a monetary amount in replyLead triggers format repair without losing the lead",async()=>{
 const fixed=payload();const {result,calls}=await ask(payload({replyLead:"Cena je 400 Kč."}),fixed);
 assert.equal(result.kind,"reply");assert.equal(calls,2);
 assert.ok(result.text.startsWith(fixed.replyLead));
 assert.equal(result.text.split("400 Kč").length-1,1);
});
test("persistent amounts in replyLead are rejected rather than exposed",async()=>{
 const value=payload({replyLead:"Cena je 400 Kč."});const {result,calls}=await ask(value,value);
 assert.equal(result.kind,"unavailable");assert.equal(calls,2);
});

test("a tire-table-only provider response produces a useful customer answer",async()=>{
 const value=payload({replyLead:"",reply:"",oilPriceFollowUp:"",safetyWarning:"",oilPriceMode:"none",oilPriceRequests:[]});
 assert.equal(validateModelResponse(value),true);
 const {result}=await ask(value);
 assert.equal(result.kind,"reply");
 assert.match(result.text,/plechov[^\n]*725 Kč/i);
 assert.match(result.text,/hliníkov[^\n]*800 Kč/i);
});
