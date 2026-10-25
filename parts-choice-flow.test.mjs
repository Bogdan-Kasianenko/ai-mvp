import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyIntakeState,missingIntakeFields} from './intake.mjs';
import {getReply} from './service.mjs';
import {partSource} from './parts-supply.mjs';

const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function draft(source){
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request',selectedOperations:['oil_filters:engine_oil'],serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje a olejového filtru',oilFilterScopeReviewed:true,customerParts:source});
 return state;
}
async function reply(initial,proposed,action,message){
 return getReply(message,company,[],initial,undefined,false,async()=>({status:'completed',output_text:JSON.stringify({safetyWarning:'',reply:'Dodání materiálu upřesníme podle Vašeho přání.',language:'cs',priceQuoted:false,partsAction:action,oilPriceMode:'none',oilPriceRequests:[],oilPriceFollowUp:'',keepClosedDay:false,needsClarification:false,statusFollowUp:'',intake:proposed,submissionAction:'none'})}));
}
for(const source of [null,false,true]){
 test(`a hypothetical own-parts inquiry preserves the server's supplier choice ${source}`,async()=>{
  const initial=draft(source);const before=structuredClone(initial);
  const proposed=structuredClone(initial);proposed.customerParts=true;proposed.partsOverrides.oilFilter=false;
  const result=await reply(initial,proposed,'keep','A mohu si přinést vlastní olej?');
  assert.equal(result.kind,'reply');
  assert.equal(result.intake.customerParts,source);
  assert.deepEqual(result.intake.partsOverrides,initial.partsOverrides);
  assert.equal(partSource(result.intake,'engineOil'),source);
  assert.equal(partSource(result.intake,'oilFilter'),source);
  assert.deepEqual(initial,before);
 });
}
test('an explicit service-supply selection clears the missing supplier field',async()=>{
 const initial=draft(null);const proposed=structuredClone(initial);proposed.customerParts=false;
 const result=await reply(initial,proposed,'update','Ano, materiál zajistí servis.');
 assert.equal(result.kind,'reply');
 assert.equal(partSource(result.intake,'engineOil'),false);
 assert.equal(partSource(result.intake,'oilFilter'),false);
 assert.ok(!missingIntakeFields(result.intake,company).includes('customerParts'));
 assert.equal(initial.customerParts,null);
});
test('unresolved supplier remains required when the customer has not chosen own parts',async()=>{
 const initial=draft(null);
 const result=await reply(initial,structuredClone(initial),'keep','Ne, servis materiál zajišťovat nemá.');
 assert.equal(result.kind,'reply');
 assert.equal(result.intake.customerParts,null);
 assert.ok(missingIntakeFields(result.intake,company).includes('customerParts'));
});
test('a hypothetical inquiry preserves a previously chosen mixed supply',async()=>{
 const initial=draft(false);initial.partsOverrides.engineOil=true;
 const proposed=structuredClone(initial);proposed.customerParts=true;proposed.partsOverrides.engineOil=null;
 const result=await reply(initial,proposed,'keep','A co kdybych si přinesl také olejový filtr?');
 assert.equal(result.kind,'reply');
 assert.equal(result.intake.customerParts,false);
 assert.equal(partSource(result.intake,'engineOil'),true);
 assert.equal(partSource(result.intake,'oilFilter'),false);
});
