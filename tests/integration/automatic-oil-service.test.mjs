import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { getReply } from "../../service.mjs";
import { emptyIntakeState } from "../../intake.mjs";
import { createChatHandler, createSessionHandler } from "../../chat-route.mjs";
import { createChatSessionStore } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";
const company=JSON.parse(readFileSync(new URL("../../company.json",import.meta.url),"utf8"));
function state(){
 const intake=emptyIntakeState();Object.assign(intake,{intent:"service_request",selectedOperations:["oil_filters:engine_oil","tires:seasonal_tires"],serviceId:"oil_filters",serviceOptionId:"engine_oil",customerParts:false,oilFilterScopeReviewed:true,requestedWork:"Výměna oleje a přezutí dvou pneumatik"});
 Object.assign(intake.vehicle,{brand:"Rolls-Royce",model:"Cullinan",year:"2019"});intake.tires={optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"};return intake;
}
function payload(intake,extra={}){
 return {safetyWarning:"",reply:"Jaké jméno mám uvést?",language:"cs",priceQuoted:false,replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction:"keep", vehicleFields: [],partsAction:"keep",oilPriceMode:"none",oilPriceRequests:[],tirePriceRequest:null,oilPriceFollowUp:"",keepClosedDay:false,needsClarification:false,statusFollowUp:"",intake:structuredClone(intake),submissionAction:"none",...extra};
}
function response(request,data){
 const value=structuredClone(data),actions=request.text.format.schema.properties.guideActions?.properties;
 if(actions)value.guideActions=Object.fromEntries(Object.keys(actions).map(id=>[id,"keep"]));
 return {status:"completed",output:[],output_text:JSON.stringify(value)};
}
const ask=(initial,value,context={},sent=false)=>getReply("1,3 benzin",company,[],initial,undefined,sent,async request=>response(request,value),false,context);

test("service supplies the omitted oil price after engine input and places the question below it",async()=>{
 const initial=state(),next=structuredClone(initial);next.vehicle.engine="1,3 l";next.vehicle.fuel="benzín";
 const result=await ask(initial,payload(next,{replyLead: "", tireUpdate: {reset:false,fields:[]}, operationsAction: "replace", vehicleAction:"update",vehicleFields:["engine","fuel"]}));
 assert.equal(result.kind,"reply");assert.match(result.text,/olejového filtru \| 400 Kč/);
 assert.equal((result.text.match(/400 Kč/g)??[]).length,1);
 assert.ok(result.text.indexOf("Jaké jméno")>result.text.indexOf("400 Kč"));
 assert.equal(result.priceQuoted,true);assert.equal(result.oilPriceRecords.length,1);
 assert.equal(result.intake.vehicle.engine,"1,3 l");assert.equal(result.intake.vehicle.fuel,"benzín");
});
test("a subsequent ordinary reply does not repeat the automatically quoted price",async()=>{
 const initial=state(),value=payload(initial);
 const first=await ask(initial,value);
 const second=await ask(first.intake,value,{oilPriceMemory:first.oilPriceRecords});
 assert.equal(second.kind,"reply");assert.doesNotMatch(second.text,/400 Kč/);
 assert.equal(second.oilPriceRecords.length,0);assert.equal(second.priceQuoted,false);
});
test("automatic own-oil labor is 500 while the service-supplied LPG filter stays 400",async()=>{
 const initial=state();initial.selectedOperations.push("oil_filters:lpg_filter");initial.partsOverrides.engineOil=true;
 const result=await ask(initial,payload(initial));
 assert.equal(result.kind,"reply");assert.match(result.text,/olejového filtru \| 500 Kč/);assert.match(result.text,/jednoho LPG filtru \| 400 Kč/);
});
test("the fallback preserves both server tables when oil and tire prices are needed together",async()=>{
 const initial=state();
 const result=await ask(initial,payload(initial,{tirePriceRequest:{optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"unknown"}}));
 assert.equal(result.kind,"reply");
 for(const amount of ["400 Kč","725 Kč","800 Kč"])assert.ok(result.text.indexOf(amount)<result.text.indexOf("Jaké jméno"));
});
test("an explicit oil comparison is unchanged and is not expanded by the fallback",async()=>{
 const initial=state();initial.selectedOperations.push("oil_filters:air_filter");
 const result=await ask(initial,payload(initial,{oilPriceMode:"requested",oilPriceRequests:[{optionId:"engine_oil",source:"compare"}]}));
 assert.equal(result.kind,"reply");assert.match(result.text,/400 Kč \| 500 Kč/);assert.doesNotMatch(result.text,/vzduchového filtru/);
});
for(const [label,extra,sent]of [
 ["safety warning",{safetyWarning:"Nepokračujte v jízdě."},false],
 ["clarification",{needsClarification:true},false],
 ["send confirmation",{submissionAction:"confirm_send"},false],
 ["status inquiry",{submissionAction:"ask_status"},false],
 ["already sent request",{},true],
]){
 test("automatic fallback is suppressed for "+label,async()=>{
  const initial=state(),result=await ask(initial,payload(initial,extra),{},sent);
  assert.equal(result.kind,"reply");assert.equal(result.oilPriceRecords.length,0);assert.doesNotMatch(result.text,/400 Kč/);
 });
}
test("unknown materials or unresolved oil filter scope still prevent an automatic quote",async()=>{
 for(const change of [{customerParts:null},{oilFilterScopeReviewed:false}]){
  const initial=Object.assign(state(),change),result=await ask(initial,payload(initial));
  assert.equal(result.kind,"reply");assert.equal(result.oilPriceRecords.length,0);
 }
});
test("a model-written price for another service does not trigger the fallback",async()=>{
 const initial=state(),result=await ask(initial,payload(initial,{reply:"Diagnostika stojí 700 Kč.",priceQuoted:true}));
 assert.equal(result.kind,"reply");assert.match(result.text,/700 Kč/);assert.doesNotMatch(result.text,/400 Kč/);
});
function out(){return Object.assign(new EventEmitter(),{locals:{},destroyed:false,writableEnded:false,code:200,cookie(){},set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});}
test("the real handler persists automatic price memory across reload and suppresses the next duplicate",async()=>{
 const repository=createRepository();
 try{
  let store=createChatSessionStore({repository});const first=store({headers:{},ip:"automatic-oil-test"},out());first.intake=state();first.persist();
  let current=state();
  const handler=()=>createChatHandler({getSession:store,loadCompanyData:async()=>company,
   replyToMessage:(...args)=>{args[6]=async request=>response(request,payload(current));return getReply(...args);},
   sendConfirmation:()=>{throw Error("Mail forbidden");}});
  async function send(id){const result=out();await handler()({headers:{cookie:"caro_session="+first.id},ip:"automatic-oil-test",body:{message:"Pokračujme",messageId:id}},result);assert.equal(result.code,200);return result.body;}
  const initial=await send("auto-oil-1");assert.match(initial.reply,/400 Kč/);
  assert.equal(repository.load(first.id).oilPriceMemory.length,1);
  store=createChatSessionStore({repository});const reloaded=out();createSessionHandler({getSession:store})({headers:{cookie:"caro_session="+first.id}},reloaded);
  current=repository.load(first.id).intake;
  const next=await send("auto-oil-2");assert.doesNotMatch(next.reply,/400 Kč/);
  assert.equal(repository.load(first.id).oilPriceMemory.length,1);
 }finally{repository.close();}
});
