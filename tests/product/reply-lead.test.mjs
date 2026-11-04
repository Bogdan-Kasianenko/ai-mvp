import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, validateModelResponse } from "../../intake.mjs";

const company=JSON.parse(readFileSync(new URL("../../company.json",import.meta.url),"utf8"));
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
 const sequence=[value.safetyWarning,value.replyLead,"Tady máte přehled počátečních cen za práci:","400 Kč","725 Kč","800 Kč",value.reply,value.oilPriceFollowUp];
 const positions=sequence.map(x=>result.text.indexOf(x));
 assert.ok(positions.every((p,i)=>p>=0&&(!i||p>positions[i-1])));
 for(const text of [value.replyLead,value.oilPriceFollowUp])assert.equal(result.text.split(text).length-1,1);
});
test("lead-only, follow-up-only and safety-only provider replies are valid",()=>{
 for(const field of ["replyLead","reply","oilPriceFollowUp","safetyWarning"]){
  const value=payload({replyLead:"",reply:"",oilPriceFollowUp:"",safetyWarning:"",[field]:"Text"});
  assert.equal(validateModelResponse(value),true,field);
 }
 assert.equal(validateModelResponse(payload({replyLead:"",reply:"",oilPriceFollowUp:"",safetyWarning:""})),false);
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
test("CSS price rules form one vertical block without obsolete horizontal layouts",()=>{
 const css=readFileSync(new URL("../../public/style.css",import.meta.url),"utf8");
 const start=css.indexOf("#chat-panel .chat-price-table {");
 const end=css.indexOf("#chat-panel #messages",start);
 assert.ok(start>=0&&end>start);
 const all=css.match(/[^{}]+\{[^{}]*\}/g)??[];
 const seen=new Map();let count=0;
 for(const rule of all){
  const boundary=rule.indexOf("{");const selectorPart=rule.slice(0,boundary).replace(/\/\*[\s\S]*?\*\//g,"").trim();
  if(!selectorPart.includes(".chat-price-table"))continue;
  count++;assert.ok(css.indexOf(rule)+rule.indexOf("#chat-panel")>=start&&css.indexOf(rule)+rule.indexOf("#chat-panel")<end,"All pricing rules belong to one contiguous block");
  const properties=[...rule.slice(boundary+1).matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map(m=>m[1]);
  assert.equal(new Set(properties).size,properties.length,"A single CSS rule must not repeat a property");
 }
 assert.ok(count>=10);
 assert.equal(css.split("#chat-panel .chat-price-table {").length-1,1);
 assert.doesNotMatch(css,/\.chat-price-table\[data-columns=/);
 assert.doesNotMatch(css,/Вертикальное отображение цен|Два столбца: услуга или вариант слева/);
 assert.match(css,/#chat-panel \.chat-price-table tbody tr\s*\{[^}]*display:\s*block/s);
 assert.match(css,/\.chat-price-table td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/s);
 const js=readFileSync(new URL("../../public/app.js",import.meta.url),"utf8");
 assert.equal(js.split('wrapper.dataset.columns = String(headers.length);').length-1,1);
});
