import { fakeModelResponse as modelResponse } from "../helpers/fake-model.mjs";
import { createModelResponse } from "../fixtures/model-response.mjs";
import { createTestCompany } from "../fixtures/company.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { getReply } from "../../service.mjs";
import { emptyIntakeState, validateModelResponse } from "../../intake.mjs";
import { createChatHandler, createSessionHandler } from "../../chat-route.mjs";
import { createChatSessionStore } from "../../chat-session.mjs";
import { createRepository } from "../../storage.mjs";
const company = createTestCompany();
function state(){
 const intake=emptyIntakeState();
 Object.assign(intake,{intent:"service_request",selectedOperations:["tires:seasonal_tires"],serviceId:"tires",serviceOptionId:"seasonal_tires",requestedWork:"Přezutí dvou pneumatik",customerParts:false});
 Object.assign(intake.vehicle,{brand:"Suzuki",model:"Swift",year:"2018",engine:"1,3 l",fuel:"benzín",mileage:"80000",windshieldSensors:false});
 return intake;
}
function payload(next,action="keep",extra={}){
  return createModelResponse(next, { vehicleAction: action, ...extra });
}

const ask=(initial,data,message="Přidejte výměnu oleje")=>getReply(message,company,[],initial,undefined,false,async request=>modelResponse(request,data));
function addOil(initial){
 const next=structuredClone(initial);
 next.selectedOperations.push("oil_filters:engine_oil");
 next.serviceId="oil_filters";next.serviceOptionId="engine_oil";
 next.requestedWork+="; výměna oleje a olejového filtru";next.oilFilterScopeReviewed=true;
 return next;
}

test("keep restores all known vehicle fields when a service addition returns nulls",async()=>{
 const initial=state(),before=structuredClone(initial),next=addOil(initial);
 for(const key of Object.keys(next.vehicle))next.vehicle[key]=null;
 const result=await ask(initial,payload(next));
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,initial.vehicle);
 assert.deepEqual(result.intake.selectedOperations,next.selectedOperations);
 assert.deepEqual(initial,before);assert.equal(result.intake.vehicle.windshieldSensors,false);
});
test("keep rejects model-invented replacements of a vehicle during a price question",async()=>{
 const initial=state(),next=structuredClone(initial);
 Object.assign(next.vehicle,{brand:"Tesla",model:"Model 3",year:"2025",engine:"2,0 l",fuel:"diesel",mileage:"1",windshieldSensors:true});
 const result=await ask(initial,payload(next),"Kolik to stojí?");
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,initial.vehicle);
});
test("keep removes skipped markers only for restored known vehicle fields",async()=>{
 const initial=state(),next=addOil(initial);
 next.skipped=["vehicle.brand","vehicle.model","vehicle.year","vehicle.engine","vehicle.mileage","customer.name"];
 next.vehicle.engine=null;
 const result=await ask(initial,payload(next));
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.skipped,["customer.name"]);
});
test("keep preserves unknown vehicle fields and their explicit skipped markers",async()=>{
 const initial=state();initial.vehicle.engine=null;initial.skipped=["vehicle.engine"];const next=addOil(initial);
 const result=await ask(initial,payload(next));
 assert.equal(result.kind,"reply");assert.equal(result.intake.vehicle.engine,null);assert.deepEqual(result.intake.skipped,["vehicle.engine"]);
});
test("update accepts explicit corrections to the same vehicle",async()=>{
 const initial=state(),next=structuredClone(initial);next.vehicle.engine="1,2 l";next.vehicle.fuel="benzín + LPG";
 const result=await ask(initial,payload(next,"update",{vehicleFields:["engine","fuel"]}),"Oprava, objem je 1,2 a benzín plus LPG");
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,next.vehicle);
});
test("a partial vehicle update preserves every unlisted vehicle field",async()=>{
 const initial=state(),next=structuredClone(initial);
 next.vehicle.engine="1,4 l";
 next.vehicle.brand=null;next.vehicle.model=null;next.vehicle.year=null;
 next.vehicle.fuel=null;next.vehicle.mileage=null;next.vehicle.windshieldSensors=null;
 const result=await ask(initial,payload(next,"update",{vehicleFields:["engine"]}),"Oprava, objem je 1,4 l");
 assert.equal(result.kind,"reply");
 assert.deepEqual(result.intake.vehicle,{...initial.vehicle,engine:"1,4 l"});
});
test("replace supports a different vehicle without restoring the previous engine or fuel",async()=>{
 const initial=state(),next=structuredClone(initial);next.vehicle=emptyIntakeState().vehicle;
 Object.assign(next.vehicle,{brand:"Škoda",model:"Octavia",year:"2020"});
 const result=await ask(initial,payload(next,"replace"),"Nakonec přijedu s jiným autem, Škoda Octavia 2020");
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,next.vehicle);
 assert.equal(result.intake.vehicle.engine,null);assert.equal(result.intake.vehicle.fuel,null);
});
test("update allows a customer to withdraw a previously supplied engine value",async()=>{
 const initial=state(),next=structuredClone(initial);next.vehicle.engine=null;next.skipped=["vehicle.engine"];
 const result=await ask(initial,payload(next,"update",{vehicleFields:["engine"]}),"Ten objem jsem uvedl špatně, neznám ho a nemám doklad");
 assert.equal(result.kind,"reply");assert.equal(result.intake.vehicle.engine,null);assert.equal(result.intake.vehicle.fuel,"benzín");
});
test("update permits first vehicle details when no previous vehicle is known",async()=>{
 const initial=emptyIntakeState(),next=structuredClone(initial);Object.assign(next.vehicle,{brand:"Suzuki",model:"Swift",year:"2018"});
 const result=await ask(initial,payload(next,"update",{vehicleFields:["brand","model","year"]}),"Suzuki Swift 2018");
 assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,next.vehicle);
});
test("vehicle keep is independent of an explicit parts-supply update and server price",async()=>{
 const initial=state(),next=addOil(initial);next.partsOverrides.engineOil=true;next.vehicle.engine=null;
 const result=await ask(initial,payload(next,"keep",{partsAction:"update",oilPriceMode:"automatic",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}]}));
 assert.equal(result.kind,"reply");assert.match(result.text,/500 Kč/);assert.deepEqual(result.intake.vehicle,initial.vehicle);
 assert.equal(result.intake.partsOverrides.engineOil,true);
});
test("response schema requires a valid vehicleAction",()=>{
 const value=payload(state());assert.equal(validateModelResponse(value),true);
 const missing=structuredClone(value);delete missing.vehicleAction;assert.equal(validateModelResponse(missing),false);
 for(const action of [null,true,{},[]])assert.equal(validateModelResponse({...value,vehicleAction:action}),false);
 assert.equal(validateModelResponse({...value,vehicleAction:"replace"}),true);
 const missingFields=structuredClone(value);delete missingFields.vehicleFields;assert.equal(validateModelResponse(missingFields),false);
 assert.equal(validateModelResponse({...value,vehicleFields:["engine","wrong"]}),false);
});
test("price-format repair retains vehicle keep and does not lose the stored vehicle",async()=>{
 const initial=state(),next=addOil(initial);next.vehicle.engine=null;next.vehicle.fuel=null;let calls=0;
 const result=await getReply("Přidejte olej",company,[],initial,undefined,false,async request=>{
  calls++;return modelResponse(request,payload(next,"keep",{oilPriceMode:"automatic",oilPriceRequests:[{optionId:"engine_oil",source:"selected"}],reply:calls===1?"Cena je 400 Kč.":"Jasně."}));
 });
 assert.equal(calls,2);assert.equal(result.kind,"reply");assert.deepEqual(result.intake.vehicle,initial.vehicle);
});
function out(){return Object.assign(new EventEmitter(),{locals:{},destroyed:false,writableEnded:false,code:200,cookie(){},set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});}
test("restored vehicle survives the real chat handler and session reload without exposing vehicleAction",async()=>{
 const repository=createRepository();
 try{
  let store=createChatSessionStore({repository});const initial=state();
  const session=store({headers:{},ip:"vehicle-action-test"},out());session.intake=initial;session.persist();
  const next=addOil(initial);next.vehicle.engine=null;next.vehicle.fuel=null;
  const handler=createChatHandler({getSession:store,loadCompanyData:async()=>company,
   replyToMessage:(...args)=>{args[6]=async request=>modelResponse(request,payload(next));return getReply(...args);},
   sendConfirmation:()=>{throw Error("Mail forbidden in vehicle tests");}});
  const response=out();await handler({headers:{cookie:"caro_session="+session.id},ip:"vehicle-action-test",body:{message:"Přidejte olej",messageId:"vehicle-add-1"}},response);
  assert.equal(response.code,200);assert.deepEqual(repository.load(session.id).intake.vehicle,initial.vehicle);
  assert.ok(!JSON.stringify(response.body).includes("vehicleAction"));
  store=createChatSessionStore({repository});const reloaded=out();
  createSessionHandler({getSession:store})({headers:{cookie:"caro_session="+session.id}},reloaded);
  assert.deepEqual(repository.load(session.id).intake.vehicle,initial.vehicle);
 }finally{repository.close();}
});

test("engine details are accepted from the final API message when commentary precedes its JSON",async()=>{
 const initial=state();initial.vehicle.engine=null;initial.vehicle.fuel=null;
 const next=addOil(initial);next.vehicle.engine="1,3 l";next.vehicle.fuel="benzín";
 const result=await getReply("1,3 benzin",company,[],initial,undefined,false,async request=>{
  const final=modelResponse(request,payload(next,"update",{vehicleFields:["engine","fuel"]}));
  const commentary="Intermediate formatting note.";
  return {...final,output_text:commentary+final.output_text,output:[
   {type:"message",role:"assistant",phase:"commentary",content:[{type:"output_text",text:commentary}]},
   {type:"message",role:"assistant",phase:"final_answer",content:[{type:"output_text",text:final.output_text}]},
  ]};
 });
 assert.equal(result.kind,"reply","Only the final message should be parsed as the structured customer response");
 assert.equal(result.intake.vehicle.engine,"1,3 l");assert.equal(result.intake.vehicle.fuel,"benzín");
 assert.ok(!result.text.includes("Intermediate formatting note"));
});
