import { fakeModelResponse as answer } from "../helpers/fake-model.mjs";
import { createModelResponse } from "../fixtures/model-response.mjs";
import { createTestCompany } from "../fixtures/company.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { emptyTireDetails, normalizeTireDetails, mergeTireDetails, missingTireDetails, tireQuoteRequest } from "../../tire-details.mjs";
import { emptyIntakeState, normalizeIntakeState, missingIntakeFields, validateModelResponse } from "../../intake.mjs";
import { readyToSend } from "../../request-flow.mjs";
import { getReply } from "../../service.mjs";
import { createChatHandler, createSessionHandler } from "../../chat-route.mjs";
import { createChatSessionStore, prepareConfirmation, confirmationMatches, draftFingerprint } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";
import { renderAutomaticOilQuotes } from "../../oil-quotes.mjs";
const company = createTestCompany();
const known={optionId:"seasonal_tires",quantity:2,rimDiameter:16,material:"alu"};
function complete(withTires=false){
 const s=emptyIntakeState(),date=new Date();date.setUTCDate(date.getUTCDate()+14+((8-date.getUTCDay())%7));
 Object.assign(s,{intent:"service_request",selectedOperations:["oil_filters:engine_oil",...(withTires?["tires:seasonal_tires"]:[])],serviceId:"oil_filters",serviceOptionId:"engine_oil",requestedWork:"Výměna oleje"+(withTires?"; přezutí dvou pneumatik":""),customerParts:false,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:date.toISOString().slice(0,10)});
 Object.assign(s.vehicle,{brand:"Suzuki",model:"Swift",year:"2018",engine:"1,3 l",fuel:"benzín"});Object.assign(s.customer,{name:"Test",email:"test@example.com"});
 if(withTires)s.tires={...known};return s;
}
function payload(next,extra={}){
  return createModelResponse(next, { reply: "", replyLead: "Jasně.", operationsAction: "keep", ...extra });
}

async function ask(initial,value){return getReply("Test",company,[],initial,undefined,false,async request=>answer(request,value),false,{oilPriceMemory:renderAutomaticOilQuotes(company,initial).records});}
function out(){return Object.assign(new EventEmitter(),{locals:{},destroyed:false,writableEnded:false,code:200,cookie(){},set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});}

test("missing material defaults to unanswered, never an assumed unknown",()=>{assert.equal(normalizeTireDetails({quantity:2,rimDiameter:16}).material,"unanswered");assert.deepEqual(normalizeTireDetails(null),emptyTireDetails());});
test("diameter-only update preserves two tires and unanswered material despite invented proposed fields",()=>{
 const previous={...known,rimDiameter:null,material:"unanswered"},proposed={...known,quantity:4,material:"unknown"};
 assert.deepEqual(mergeTireDetails(previous,proposed,{reset:false,fields:["rimDiameter"]}),{...previous,rimDiameter:16});assert.equal(previous.rimDiameter,null);
});
test("explicit material update preserves the known diameter and quantity",()=>{assert.deepEqual(mergeTireDetails(known,{material:"unknown"},{reset:false,fields:["material"]}),{...known,material:"unknown"});});
test("empty changes preserve every known parameter",()=>{assert.deepEqual(mergeTireDetails(known,emptyTireDetails(),{reset:false,fields:[]}),known);});
test("a new independent tire task may explicitly reset old parameters",()=>{assert.deepEqual(mergeTireDetails(known,{quantity:4},{reset:true,fields:["quantity"]}),{...emptyTireDetails(),quantity:4});});
test("invalid diameter, quantity and material never become usable quote parameters",()=>{assert.deepEqual(normalizeTireDetails({quantity:5,rimDiameter:-1,material:"whatever"}),emptyTireDetails());});
for(const material of ["steel","alu","unknown"]){test("resolved material permits quoting and review: "+material,()=>{const s=complete(true);s.tires.material=material;assert.deepEqual(missingTireDetails(s),[]);assert.equal(readyToSend(s,company),true);assert.equal(tireQuoteRequest(s).material,material);});}
test("unanswered material blocks review even when the model clears pendingDetails",()=>{const s=complete(true);s.tires.material="unanswered";s.pendingDetails=[];assert.equal(readyToSend(s,company),false);assert.ok(missingIntakeFields(s,company).includes("tires.rimMaterial"));assert.equal(tireQuoteRequest(s),null);assert.ok(normalizeIntakeState(s,company).pendingDetails.includes("tires.rimMaterial"));});
test("removing tires clears their parameters and blockers but preserves other pending details",()=>{const s=complete(true);s.selectedOperations=["oil_filters:engine_oil"];s.pendingDetails=["tires.rimMaterial","insurance.damageDescription"];const normalized=normalizeIntakeState(s,company);assert.deepEqual(normalized.tires,emptyTireDetails());assert.deepEqual(normalized.pendingDetails,["insurance.damageDescription"]);});
test("server suppresses a premature price and preserves two tires on a diameter-only message",async()=>{
 const initial=complete(true);initial.tires={...known,rimDiameter:null,material:"unanswered"};const next=structuredClone(initial);next.tires={...known,quantity:4,material:"unknown"};
 const result=await ask(initial,payload(next,{tireUpdate:{reset:false,fields:["rimDiameter"]},tirePriceRequest:{...known,quantity:4,material:"unknown"},oilPriceFollowUp:"Jsou ráfky plechové, nebo hliníkové?"}));
 assert.equal(result.kind,"reply");assert.equal(result.intake.tires.quantity,2);assert.equal(result.intake.tires.material,"unanswered");assert.ok(result.intake.pendingDetails.includes("tires.rimMaterial"));assert.doesNotMatch(result.text,/725 Kč|800 Kč/);assert.equal(result.hasFollowUp,true);
});
test("stored parameters override inconsistent quote-only quantities",async()=>{const initial=complete(true);const result=await ask(initial,payload(initial,{tirePriceRequest:{...known,quantity:4}}));assert.equal(result.kind,"reply");assert.match(result.text,/2 × 16″/);assert.match(result.text,/800 Kč/);assert.doesNotMatch(result.text,/1.?600 Kč/);});
test("explicit unknown gives both correct prices without a material blocker",async()=>{const initial=complete(true);initial.tires.material="unanswered";const next=structuredClone(initial);next.tires.material="unknown";const result=await ask(initial,payload(next,{tireUpdate:{reset:false,fields:["material"]},tirePriceRequest:{...known,material:"unknown"}}));assert.equal(result.kind,"reply");assert.match(result.text,/725 Kč/);assert.match(result.text,/800 Kč/);assert.deepEqual(result.intake.pendingDetails,[]);});
test("tireUpdate is required and must name allowed fields",()=>{const value=payload(complete());assert.equal(validateModelResponse(value),true);const missing=structuredClone(value);delete missing.tireUpdate;assert.equal(validateModelResponse(missing),false);assert.equal(validateModelResponse({...value,tireUpdate:{reset:false,fields:["arbitrary"]}}),false);});
for(const key of ["quantity","rimDiameter","material"]){test("changing "+key+" invalidates old consent without relying on requestedWork wording",()=>{const s=complete(true),repo=createRepository();try{const session={intake:s,requestId:"test",revision:0};const token=prepareConfirmation(session),before=draftFingerprint(s);assert.equal(confirmationMatches(session,token),true);s.tires[key]=key==="material"?"steel":key==="quantity"?4:17;assert.notEqual(draftFingerprint(s),before);assert.equal(confirmationMatches(session,token),false);}finally{repo.close();}});}
test("ready request stays open for a follow-up, then gets new consent after material is resolved and survives reload",async()=>{
 const repo=createRepository();try{
 let store=createChatSessionStore({repository:repo});const first=store({headers:{},ip:"tire-regression"},out());first.intake=complete();const oldToken=prepareConfirmation(first);first.oilPriceMemory=renderAutomaticOilQuotes(company,first.intake).records;first.persist();
 let proposed;
 const handler=()=>createChatHandler({getSession:store,loadCompanyData:async()=>company,replyToMessage:async(...args)=>{args[6]=async request=>answer(request,proposed);return getReply(...args);},sendConfirmation:()=>{throw Error("Mail forbidden");}});
 let n=0;const turn=async(message)=>{const response=out();await handler()({headers:{cookie:"caro_session="+first.id},ip:"tire-regression",body:{message,messageId:"test-"+(++n)}},response);assert.equal(response.code,200,JSON.stringify(response.body));return response.body;};
 const pending=complete(true);pending.tires={...known,rimDiameter:null,material:"unanswered"};
 proposed=payload(pending,{operationsAction:"add",tireUpdate:{reset:false,fields:["optionId","quantity"]},oilPriceFollowUp:"Jaký je průměr ráfků?"});
 let result=await turn("Přidejte dvě přední pneumatiky");assert.equal(result.confirmationToken,null);assert.doesNotMatch(result.reply,/Zkontrolujte/);assert.ok(repo.load(first.id).intake.pendingDetails.includes("tires.rimDiameter"));
 store=createChatSessionStore({repository:repo});
 const diameter=structuredClone(repo.load(first.id).intake);diameter.tires.rimDiameter=16;
 proposed=payload(diameter,{tireUpdate:{reset:false,fields:["rimDiameter"]},oilPriceFollowUp:"Jsou ráfky plechové, nebo hliníkové?"});
 result=await turn("16 palců");assert.equal(result.confirmationToken,null);assert.doesNotMatch(result.reply,/Zkontrolujte|725 Kč|800 Kč/);
 const resolved=structuredClone(repo.load(first.id).intake);resolved.tires.material="unknown";
 proposed=payload(resolved,{tireUpdate:{reset:false,fields:["material"]},tirePriceRequest:{...known,material:"unknown"}});
 result=await turn("Nevím, ukažte obě ceny");assert.match(result.reply,/725 Kč/);assert.match(result.reply,/800 Kč/);assert.match(result.reply,/Zkontrolujte/);assert.ok(result.confirmationToken);assert.notEqual(result.confirmationToken,oldToken);
 const saved=repo.load(first.id);store=createChatSessionStore({repository:repo});const response=out();createSessionHandler({getSession:store})({headers:{cookie:"caro_session="+first.id}},response);assert.deepEqual(repo.load(first.id).intake.tires,{...known,material:"unknown"});assert.equal(response.body.confirmationToken,result.confirmationToken);
 proposed=payload(saved.intake,{oilPriceFollowUp:"Chcete ještě něco upřesnit?"});result=await turn("Ještě dotaz");assert.equal(result.confirmationToken,null);assert.doesNotMatch(result.reply,/Zkontrolujte/);
 }finally{repo.close();}
});
test("informational tire pricing must remain available without selecting a booking",async()=>{const initial=emptyIntakeState();initial.intent="service_discussion";initial.tires={...known,material:"unknown"};const result=await ask(initial,payload(initial,{tireUpdate:{reset:false,fields:["optionId","quantity","rimDiameter","material"]},tirePriceRequest:{...known,material:"unknown"}}));assert.equal(result.kind,"reply");assert.equal(result.intake.selectedOperations,null);assert.match(result.text,/725 Kč/);assert.match(result.text,/800 Kč/);});
