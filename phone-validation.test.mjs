import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPhone, normalizePhone, phoneInputContext} from './phone-contact.mjs';
import {emptyIntakeState, hasValidContact, missingIntakeFields} from './intake.mjs';
import {readyToSend} from './request-flow.mjs';
import {getReply} from './service.mjs';

const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function draft(){
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request',selectedOperations:['oil_filters:engine_oil'],serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje a filtru',customerParts:true,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:'2099-10-26'});
 Object.assign(state.vehicle,{brand:'Suzuki',model:'Swift',year:'2018'});
 state.customer.name='Bohdan';
 return state;
}
for(const [input,length,difference] of [['787865',6,-3],['77365474',8,-1],['7736547488',10,1],['+420 77365474',8,-1],['4207736547488',10,1]]){
 test(`invalid Czech number ${input}: exact server length and sending gate`,()=>{
  const result=inspectPhone(input);
  assert.equal(result.kind,'cz');
  assert.equal(result.valid,false);
  assert.equal(result.nationalLength,length);
  assert.equal(result.difference,difference);
  assert.equal(result.normalized,null);
  assert.equal(normalizePhone(input),input);
  const state=draft();state.customer.phone=input;
  assert.equal(hasValidContact(state.customer),false);
  assert.ok(missingIntakeFields(state,company).includes('customer.contact'));
  assert.equal(readyToSend(state,company),false);
 });
}
for(const input of ['773654748','773 654 748','+420 773 654 748','420773654748','00420 773 654 748']){
 test(`valid Czech spelling ${input} normalizes without asking for a prefix`,()=>{
  assert.equal(inspectPhone(input).valid,true);
  assert.equal(normalizePhone(input),'+420773654748');
  const state=draft();state.customer.phone=normalizePhone(input);
  assert.equal(readyToSend(state,company),true);
 });
}
test('an explicit foreign prefix does not use Czech national length',()=>{
 const checked=inspectPhone('+49 151 23456789');
 assert.equal(checked.kind,'international');
 assert.equal(checked.valid,true);
 assert.equal(checked.normalized,'+4915123456789');
 assert.equal(checked.nationalLength,null);
});
test('contact detection excludes dates and mixed name/phone messages',()=>{
 for(const value of ['2026-10-26','26.10.2026','26/10/2026','Bohdan 787865']) assert.equal(phoneInputContext(value,true),null);
 assert.equal(phoneInputContext('773654748',false),null);
 assert.equal(phoneInputContext('787865',true).difference,-3);
});
test('a valid email allows completion despite an invalid optional phone',()=>{
 const state=draft();Object.assign(state.customer,{phone:'787865',email:'test@example.com'});
 assert.equal(readyToSend(state,company),true);
});

async function modelReply(message,modelPhone,initial=draft()){
 let context;
 const result=await getReply(message,company,[],initial,undefined,false,async params=>{
  context=JSON.parse(params.input[0].content.slice(params.input[0].content.indexOf('{')));
  const intake=structuredClone(initial);intake.customer.phone=modelPhone;
  return {status:'completed',output_text:JSON.stringify({safetyWarning:'',reply:'Zkontrolujte prosím celé telefonní číslo.',language:'cs',priceQuoted:false,partsAction:'keep',oilPriceMode:'none',oilPriceRequests:[],oilPriceFollowUp:'',keepClosedDay:false,needsClarification:true,statusFollowUp:'',intake,submissionAction:'none'})};
 });
 assert.equal(result.kind,'reply');
 return {result,context};
}
for(const input of ['787865','7736547488']){
 test(`service preserves invalid input ${input} even if the model invents a valid phone`,async()=>{
  const {result,context}=await modelReply(input,'773654748');
  assert.equal(context.contactChecks.providedPhone.valid,false);
  assert.equal(context.contactChecks.providedPhone.nationalLength,input.length);
  assert.equal(result.intake.customer.phone,input);
  assert.equal(result.intake.customer.name,'Bohdan');
  assert.equal(readyToSend(result.intake,company),false);
 });
}
test('a valid correction overrides the old invalid phone returned by the model',async()=>{
 const initial=draft();initial.customer.phone='787865';
 const {result,context}=await modelReply('420773654748','787865',initial);
 assert.equal(context.contactChecks.providedPhone.valid,true);
 assert.equal(result.intake.customer.phone,'+420773654748');
 assert.equal(readyToSend(result.intake,company),true);
});
test('a phone extracted by the model from a mixed name/phone message is still validated',async()=>{
 const {result,context}=await modelReply('Bohdan 787865','787865');
 assert.equal(context.contactChecks.providedPhone,null);
 assert.equal(result.intake.customer.name,'Bohdan');
 assert.equal(hasValidContact(result.intake.customer),false);
 assert.equal(readyToSend(result.intake,company),false);
});
