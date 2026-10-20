import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {inspectAppointmentPreference,pragueToday,readAppointmentDate,reviewAppointment,appointmentIssueMessage} from './appointment-calendar.mjs';
import {emptyIntakeState,missingIntakeFields} from './intake.mjs';
import {readyToSend,presentRequestStep,handleSendConfirmation} from './request-flow.mjs';
import {prepareConfirmation,confirmationMatches} from './chat-session.mjs';
import {createChatHandler} from './chat-route.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
const fixedNow=new Date('2026-10-19T08:00:00Z');
function complete(date='2099-10-26'){
 const state=emptyIntakeState();Object.assign(state,{intent:'service_request', selectedOperations: ["oil_filters:engine_oil"], serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje a filtru',customerParts:true,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:date});Object.assign(state.vehicle,{brand:'Test',model:'Test',year:'2018'});Object.assign(state.customer,{name:'Test',email:'test@example.com'});return state;
}
for(const value of ['31. 02. 2027','2027-02-29','2100-02-29','2027-13-01','2027-00-10','2027-01-00','25.10','25','2027','2027-01-01 and 2027-01-02','31. února 2027'])test('sending gate rejects invalid or incomplete date: '+value,()=>{
 const state=complete(value);assert.equal(readyToSend(state,company),false);assert.ok(missingIntakeFields(state,company).includes('preferredTime'));assert.equal(presentRequestStep('Prosím upřesnit.',state,{company}),'Prosím upřesnit.');
});
test('Gregorian leap-year rules are checked without Date.parse rollover',()=>{
 assert.equal(readAppointmentDate('29.02.2000'),'2000-02-29');assert.equal(readAppointmentDate('29.02.2100'),null);assert.equal(readAppointmentDate('29.02.2028'),'2028-02-29');
});
for(const value of ['2026-10-24','24. 10. 2026','24. října 2026','24. októbra 2026','24 октября 2026','24 жовтня 2026','24. Oktober 2026','October 24, 2026'])test('valid complete date is recognized: '+value,()=>{
 const result=inspectAppointmentPreference(value,fixedNow);assert.equal(result.valid,true);assert.equal(result.kind,'date');assert.equal(result.date,'2026-10-24');
});
test('Prague date, not UTC day, defines the boundary',()=>{
 const midnight=new Date('2026-10-18T22:30:00Z');assert.equal(pragueToday(midnight),'2026-10-19');assert.equal(inspectAppointmentPreference('2026-10-18',midnight).reason,'past');assert.equal(inspectAppointmentPreference('2026-10-19',midnight).valid,true);
 assert.equal(pragueToday(new Date('2026-12-31T23:30:00Z')),'2027-01-01');
});
test('flexible wishes are a distinct preference and do not become an invented date',()=>{
 const value=inspectAppointmentPreference('Pátek odpoledne',fixedNow);assert.equal(value.kind,'flexible');assert.equal(value.date,null);assert.equal(value.valid,true);assert.equal(readyToSend(complete('Pátek odpoledne'),company),true);
});
test('clock time is checked and preserved when valid',()=>{
 assert.equal(inspectAppointmentPreference('2026-10-24 25:30',fixedNow).valid,false);assert.equal(inspectAppointmentPreference('2026-10-24 10:60',fixedNow).valid,false);
 const previous=complete(null),next=complete('24.10.2026 v 9:30');const review=reviewAppointment({previous,next,message:'24.10.2026 v 9:30',company,now:fixedNow});assert.equal(review.blocked,false);assert.equal(next.preferredTime,'2026-10-24 09:30');
});
function session(state){return{intake:state,history:[],revision:0,requestId:'date-audit',language:'cs',confirmation:null,lastDelivery:null,acquire:()=>true,release(){},persist(){},repository:{activeCount:()=>0,allow:()=>true,allowMany:()=>true,delivery:()=>null}};}
function response(){return Object.assign(new EventEmitter(),{locals:{},writableEnded:false,json(body){this.body=body;return this;},status(code){this.code=code;return this;}});}
for(const date of ['31.02.2027','2020-01-01'])test('fake model cannot authorize an invalid date even with confirm_send: '+date,async()=>{
 const s=session(complete(date));let sends=0;
 const handler=createChatHandler({getSession:()=>s,loadCompanyData:async()=>company,replyToMessage:async()=>({kind:'reply',text:'Mám poslat?',intake:complete(date),language:'cs',submissionAction:'confirm_send',keepClosedDay:true}),sendConfirmation:async()=>{sends++;throw Error('Unexpected mail');}});
 const out=response();await handler({body:{message:date,messageId:'bad-date'},ip:'test'},out);
 assert.equal(sends,0);assert.equal(out.body.confirmationToken,null);assert.equal(out.body.intake.preferredTime,null);assert.doesNotMatch(out.body.reply,/Zkontrolujte/);
});
test('an invalid complete customer date is not silently replaced with a model-invented valid date',()=>{
 const next=complete('2099-10-26');const result=reviewAppointment({previous:complete(),next,message:'31.02.2027',company,now:fixedNow});assert.equal(result.blocked,true);assert.equal(next.preferredTime,null);
});
test('accepted closed-day exception cannot override a past date',()=>{
 const next=complete('2026-10-18');const result=reviewAppointment({previous:complete(),next,message:'ano',company,review:{date:'2026-10-18',accepted:true},keepClosedDay:true,now:fixedNow});assert.equal(result.blocked,true);assert.equal(result.issue.reason,'past');
});
test('confirmation that crosses Prague midnight cannot send yesterday’s request',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-24T21:59:59Z')});
 const s=session(complete('2026-10-24'));const token=prepareConfirmation(s);assert.equal(readyToSend(s.intake,company),true);
 t.mock.timers.tick(1000);assert.equal(confirmationMatches(s,token),true);let sends=0;
 assert.equal(await handleSendConfirmation({session:s,company,confirmationToken:token,ip:'test',sendRequest:async()=>{sends++;}}),null);assert.equal(sends,0);
});
test('cached summary cannot revive a date that became past after Prague midnight',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-24T21:59:59Z')});
 const s=session(complete('2026-10-24'));const token=prepareConfirmation(s);s.responses=[{id:'old-summary',message:'review',body:{reply:'Summary',intake:structuredClone(s.intake),conversationId:s.requestId,revision:s.revision,confirmationToken:token}}];
 t.mock.timers.tick(1000);let model=0;
 const handler=createChatHandler({getSession:()=>s,loadCompanyData:async()=>company,replyToMessage:async()=>{model++;throw Error('Not expected');}});const out=response();await handler({body:{message:'review',messageId:'old-summary'},ip:'test'},out);assert.equal(out.code,409);assert.equal(model,0);
});
test('all supported languages have a date clarification',()=>{
 for(const language of ['cs','sk','en','ru','uk','de'])for(const reason of ['past','invalid','time'])assert.ok(appointmentIssueMessage({reason},language).length>20);
});
test('status of an already sent request remains available after its preferred date passed',async()=>{
 const state=complete('2020-01-01');state.intent='service_discussion';const s=session(state);s.lastDelivery='sent-before';s.repository.delivery=()=>({status:'sent',data:structuredClone(state)});
 const handler=createChatHandler({getSession:()=>s,loadCompanyData:async()=>company,replyToMessage:async()=>({kind:'reply',text:'Status?',intake:structuredClone(state),language:'cs',submissionAction:'ask_status'}),sendConfirmation:()=>{throw Error('No resend');}});
 const out=response();await handler({body:{message:'Je žádost odeslaná?',messageId:'past-sent-status'},ip:'test'},out);assert.match(out.body.reply,/odeslána/);assert.equal(out.body.intake.preferredTime,'2020-01-01');assert.equal(out.body.confirmationToken,null);
});
