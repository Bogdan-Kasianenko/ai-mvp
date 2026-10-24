import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyIntakeState,normalizeIntakeState,missingIntakeFields} from './intake.mjs';
import {readyToSend,presentRequestStep} from './request-flow.mjs';
import {buildRequestEmail} from './mailer.mjs';
import {draftFingerprint} from './chat-session.mjs';
import {getReply} from './service.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function full(){
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request',selectedOperations:['oil_filters:engine_oil'],serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje a olejového filtru',customerParts:false,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:'2099-10-26'});
 Object.assign(state.vehicle,{brand:'Suzuki',model:'Swift',year:'2018',engine:'1.4 l',fuel:'benzín'});
 Object.assign(state.customer,{name:'Test',email:'test@example.com'});
 return state;
}
test('added oil change requires engine details regardless of the main service',()=>{
 const state=full();state.serviceOptionId='air_filter';
 state.selectedOperations=['oil_filters:air_filter','oil_filters:engine_oil'];
 state.vehicle.engine=null;
 assert.ok(missingIntakeFields(state,company).includes('vehicle.engine'));
 assert.equal(readyToSend(state,company),false);
 state.vehicle.engine='1.4 l';assert.equal(readyToSend(state,company),true);
 state.vehicle.engine=null;state.skipped.push('vehicle.engine');
 assert.equal(readyToSend(state,company),true);
 state.skipped=[];Object.assign(state.partsOverrides,{engineOil:true,oilFilter:true});
 assert.equal(readyToSend(state,company),true);
 state.partsOverrides.oilFilter=null;
 assert.ok(missingIntakeFields(state,company).includes('vehicle.engine'));
});
for(const base of [true,false,null])test('removed LPG supplier stays out of state, summary and email with base '+base,()=>{
 const state=full();state.customerParts=base;state.partsOverrides.lpgFilter=true;
 if(base===null)Object.assign(state.partsOverrides,{engineOil:true,oilFilter:true});
 const normalized=normalizeIntakeState(state,company);
 assert.equal(normalized.partsOverrides.lpgFilter,null);
 assert.equal(readyToSend(normalized,company),true);
 assert.doesNotMatch(presentRequestStep('',normalized,{company}),/LPG/);
 assert.doesNotMatch(buildRequestEmail(normalized,company,'test'),/LPG/);
 assert.doesNotMatch(presentRequestStep('',state,{company}),/LPG/);
 assert.doesNotMatch(buildRequestEmail(state,company,'test'),/LPG/);
});
test('selected mixed suppliers are retained and removing one job clears only its override',()=>{
 const state=full();state.selectedOperations.push('oil_filters:lpg_filter');
 Object.assign(state.partsOverrides,{engineOil:true,lpgFilter:true});
 const selected=normalizeIntakeState(state,company);
 assert.equal(selected.partsOverrides.engineOil,true);
 assert.equal(selected.partsOverrides.lpgFilter,true);
 selected.selectedOperations.pop();
 const removed=normalizeIntakeState(selected,company);
 assert.equal(removed.partsOverrides.engineOil,true);
 assert.equal(removed.partsOverrides.lpgFilter,null);
});
test('unselected overrides do not change the draft fingerprint',()=>{
 const state=full();const fingerprint=draftFingerprint(state);
 state.partsOverrides.lpgFilter=true;
 assert.equal(draftFingerprint(state),fingerprint);
 state.partsOverrides.engineOil=true;
 assert.notEqual(draftFingerprint(state),fingerprint);
});
test('legacy unknown scope retains suppliers until the list is reconstructed',()=>{
 const state=full();state.selectedOperations=null;state.partsOverrides.lpgFilter=true;
 const normalized=normalizeIntakeState(state,company);
 assert.equal(normalized.partsOverrides.lpgFilter,true);
 assert.equal(readyToSend(normalized,company),false);
});
test('service normalizes current scope before returning prices and intake',async()=>{
 const state=full();const intake=structuredClone(state);intake.partsOverrides.lpgFilter=true;
 const model={safetyWarning:'',reply:'Dobře.',language:'cs',priceQuoted:false,keepClosedDay:false,needsClarification:false,statusFollowUp:'',submissionAction:'none',intake,partsAction:'update',oilPriceMode:'requested',oilPriceRequests:[{optionId:'engine_oil',source:'selected'}],oilPriceFollowUp:''};
 const result=await getReply('Cena?',company,[],state,undefined,false,async()=>({status:'completed',output_text:JSON.stringify(model)}));
 assert.equal(result.kind,'reply');
 assert.equal(result.intake.partsOverrides.lpgFilter,null);
 assert.equal(result.oilPriceRecords[0].variants[0].priceFromKc,400);
});

// Calendar fixtures below are evaluated relative to this fixed Prague date.
import { beforeEach } from "node:test";
beforeEach(t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-20T08:00:00Z") });
});
