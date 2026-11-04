import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyIntakeState,missingIntakeFields,normalizeIntakeState} from '../../intake.mjs';
import {readyToSend} from '../../request-flow.mjs';
import {describeParts} from '../../parts-supply.mjs';
const company=JSON.parse(readFileSync(new URL('../../company.json',import.meta.url),'utf8'));
function full(overrides={engineOil:true,oilFilter:true},work='Výměna motorového oleje a olejového filtru',option='engine_oil') {
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request',selectedOperations:['oil_filters:'+option],serviceId:'oil_filters',serviceOptionId:option,requestedWork:work,customerParts:null,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:'2099-10-26'});
 Object.assign(state.partsOverrides,overrides);
 Object.assign(state.vehicle,{brand:'Test',model:'Test',year:'2018',engine:'1.4 l',fuel:'benzín'});
 Object.assign(state.customer,{name:'Test',email:'test@example.com'});
 return normalizeIntakeState(state,company);
}
for(const oil of [true,false])for(const filter of [true,false])test(`oil/filter sources suffice without general default (${oil}/${filter})`,()=>{
 const state=full({engineOil:oil,oilFilter:filter});
 assert.equal(missingIntakeFields(state,company).includes('customerParts'),false);
 assert.equal(readyToSend(state,company),true);
 assert.equal(state.customerParts,null,'do not invent a general supplier');
});
for(const missing of ['engineOil','oilFilter'])test('unknown selected supplier still blocks: '+missing,()=>{
 const state=full();state.partsOverrides[missing]=null;
 assert.ok(missingIntakeFields(state,company).includes('customerParts'));assert.equal(readyToSend(state,company),false);
});
for(const [option,key,name] of [['air_filter','airFilter','Výměna vzduchového filtru motoru'],['cabin_filter','cabinFilter','Výměna kabinového (pylového) filtru'],['fuel_filter','fuelFilter','Výměna palivového filtru'],['lpg_filter','lpgFilter','Výměna LPG filtru']])test('only the selected filter needs a supplier: '+option,()=>{
 const state=full({[key]:false},name,option);assert.equal(readyToSend(state,company),true);
 state.partsOverrides[key]=null;assert.equal(readyToSend(state,company),false);
});
test('an added air filter blocks until its supplier is known',()=>{
 const state=full({engineOil:true,oilFilter:true},'Výměna oleje a olejového i vzduchového filtru');
 state.selectedOperations.push('oil_filters:air_filter');
 assert.equal(readyToSend(state,company),false);
 assert.ok(missingIntakeFields(state,company).includes('customerParts'));
 state.partsOverrides.airFilter=false;assert.equal(readyToSend(state,company),true);
});
test('all filters requires the standard scope and includes explicitly selected fuel/LPG filters',()=>{
 const state=full({engineOil:true,oilFilter:true,airFilter:false,cabinFilter:false},'Výměna oleje a všech filtrů');
 state.selectedOperations=['engine_oil','air_filter','cabin_filter'].map(id=>'oil_filters:'+id);
 Object.assign(state.partsOverrides,{airFilter:false,cabinFilter:false});
 assert.equal(readyToSend(state,company),true);
 state.requestedWork+=' a LPG filtru';state.selectedOperations.push('oil_filters:lpg_filter');assert.equal(readyToSend(state,company),false);
 state.partsOverrides.lpgFilter=false;assert.equal(readyToSend(state,company),true);
 state.requestedWork+=' a palivového filtru';state.selectedOperations.push('oil_filters:fuel_filter');assert.equal(readyToSend(state,company),false);
 state.partsOverrides.fuelFilter=true;assert.equal(readyToSend(state,company),true);
});
test('unmapped extra work cannot be covered by oil-specific overrides',()=>{
 const state=full({engineOil:true,oilFilter:true},'Výměna oleje a filtru a brzdových destiček');state.selectedOperations.push('brakes:brake_pads');
 assert.equal(readyToSend(state,company),false);
 state.customerParts=false;assert.equal(readyToSend(state,company),true);
});
test('oil overrides do not satisfy unrelated material jobs',()=>{
 const state=full();state.selectedOperations=['timing_service:'];state.serviceId='timing_service';state.serviceOptionId=null;state.requestedWork='Výměna rozvodů';
 assert.ok(missingIntakeFields(state,company).includes('customerParts'));
});
test('known service oil supply still requires engine details; own oil and filter do not',()=>{
 const own=full();own.vehicle.engine=null;assert.equal(readyToSend(own,company),true);
 const mixed=full({engineOil:true,oilFilter:false});mixed.vehicle.engine=null;
 assert.ok(missingIntakeFields(mixed,company).includes('vehicle.engine'));
});
test('complete individual sources do not add an unknown other-materials line to the summary',()=>{
 const text=describeParts(full(),'cs','fallback');
 assert.match(text,/olej: dodá zákazník/);assert.match(text,/olejový filtr: dodá zákazník/);
 assert.doesNotMatch(text,/ostatní|upřesněno/);
});
test('unused overrides are omitted from an individually resolved scope',()=>{
 const state=full({engineOil:true,oilFilter:false,lpgFilter:true});
 assert.doesNotMatch(describeParts(state,'cs','fallback'),/LPG/);
});
test("Невыбранный фильтр в описании не требует поставщика", () => {
  const descriptions = [
    "Výměna oleje a olejového filtru bez vzduchového filtru",
    "Výmena oleja a olejového filtra bez vzduchového filtra",
    "Replace engine oil and oil filter only",
    "Замена масла и масляного фильтра без воздушного фильтра",
    "Заміна оливи та оливного фільтра без повітряного фільтра",
    "Nur Motoröl- und Ölfilterwechsel",
  ];

  for (const description of descriptions) {
    const state = full(undefined,description);

    assert.equal(readyToSend(state, company), true, description);
  }
});

test("Неуточнённая дополнительная работа блокирует отправку", () => {
  const descriptions = [
    "Výměna oleje a motoru",
    "Engine oil replacement and engine replacement",
    "Замена масла и мотора",
  ];

  for (const description of descriptions) {
    const state = full(undefined,description);
    state.selectedOperations.push("other");

    assert.ok(
      missingIntakeFields(state, company).includes("selectedOperations"),
      description
    );
    assert.equal(readyToSend(state, company), false);

    // Общий поставщик не устраняет неопределённость состава работ.
    state.customerParts = true;
    assert.equal(readyToSend(state, company), false);
  }
});

test("Старая заявка без списка работ требует уточнения", () => {
  const state = full(undefined,"Výměna oleje a motoru");
  delete state.selectedOperations;

  assert.ok(
    missingIntakeFields(state, company).includes("selectedOperations")
  );
  assert.equal(readyToSend(state, company), false);
});
