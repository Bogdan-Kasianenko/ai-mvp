import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getReply} from './service.mjs';
import {emptyIntakeState,normalizeIntakeState} from './intake.mjs';
import {presentRequestStep,readyToSend} from './request-flow.mjs';
import {buildRequestEmail} from './mailer.mjs';

const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
for(const available of [true,false,null]){
 test(`replacement vehicle FAQ passes authoritative availability=${available} and unknown price to the model`,async()=>{
  const data=structuredClone(company);
  data.policies.replacementVehicle={available,priceKc:null,availability:null};
  const before=structuredClone(data);
  let request;
  const intake=emptyIntakeState();
  const question='Nabízíte náhradní vozidlo během opravy?';
  const result=await getReply(question,data,[],intake,undefined,false,async params=>{
   request=params;
   return {status:'completed',output_text:JSON.stringify({safetyWarning:'',reply:'Dostupnost a cenu Vám potvrdí servis.',language:'cs',priceQuoted:false,partsAction:'keep',oilPriceMode:'none',oilPriceRequests:[],oilPriceFollowUp:'',keepClosedDay:false,needsClarification:false,statusFollowUp:'',intake,submissionAction:'none'})};
  });
  assert.equal(result.kind,'reply');
  const line=request.instructions.split('\n').find(line=>line.startsWith('Firemní data: '));
  const supplied=JSON.parse(line.slice('Firemní data: '.length));
  assert.deepEqual(supplied.policies.replacementVehicle,data.policies.replacementVehicle);
  assert.deepEqual(data,before,'request preparation must not invent a price or overwrite company policy');
  assert.equal(request.input.at(-1).content,question);
  assert.equal(readyToSend(result.intake,data),false,'an informational draft cannot produce a sendable booking');
 });
}
test('explicit replacement vehicle wish survives normalization, request summary and email alongside the repair',()=>{
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request',selectedOperations:['timing_service:'],serviceId:'timing_service',requestedWork:'Výměna rozvodů. Zákazník si přeje náhradní vůz během opravy.',customerParts:false,additionalServicesReviewed:true,preferredTime:'2099-10-27'});
 Object.assign(state.vehicle,{brand:'Range Rover',model:'Autobiography',year:'2019'});
 Object.assign(state.customer,{name:'Radek',phone:'+420448447445'});
 const normalized=normalizeIntakeState(state,company);
 assert.equal(readyToSend(normalized,company),true);
 assert.deepEqual(normalized.selectedOperations,['timing_service:']);
 for(const text of [presentRequestStep('',normalized,{company}),buildRequestEmail(normalized,company,'replacement-vehicle-test')]){
  assert.match(text,/Výměna rozvodů/);
  assert.match(text,/Zákazník si přeje náhradní vůz během opravy/);
 }
});
