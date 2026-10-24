import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {emptyIntakeState} from './intake.mjs';
import {createChatHandler} from './chat-route.mjs';
import {prepareConfirmation} from './chat-session.mjs';
import {appointmentIssueMessage} from './appointment-calendar.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function complete(date){
 const state=emptyIntakeState();
 Object.assign(state,{intent:'service_request', selectedOperations: ["oil_filters:engine_oil"], serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje a filtru',customerParts:true,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:date});
 Object.assign(state.vehicle,{brand:'Test',model:'Test',year:'2018'});
 Object.assign(state.customer,{name:'Test',email:'test@example.com'});
 return state;
}
async function run(date,text,language,safetyWarning=""){
 const state=complete('2026-10-24');
 const session={id:'warning-test',intake:state,history:[],revision:0,requestId:'warning-draft',language,confirmation:null,lastDelivery:null,acquire:()=>true,release(){},persist(){},repository:{activeCount:()=>0,allow:()=>true,allowMany:()=>true,delivery:()=>null}};
 const oldToken=prepareConfirmation(session);
 let sends=0;
 const handler=createChatHandler({getSession:()=>session,loadCompanyData:async()=>company,
  replyToMessage:async()=>({kind:'reply',text,safetyWarning,intake:complete(date),language,submissionAction:'confirm_send',keepClosedDay:false}),
  sendConfirmation:async()=>{sends++;throw Error('Unexpected email');}});
 const response=Object.assign(new EventEmitter(),{locals:{},writableEnded:false,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 await handler({body:{message:date,messageId:'warning-message',confirmationToken:oldToken},ip:'test'},response);
 return {session,body:response.body,sends};
}
const warnings={
 cs:'Pokud vůz nebrzdí, nepokračujte v jízdě. Bezpečně zastavte a zajistěte odtah. Už jste na bezpečném místě?',
 ru:'Если тормоза не работают, не продолжайте движение. Безопасно остановитесь и вызовите эвакуатор. Вы уже в безопасном месте?',
};
for(const language of ['cs','ru'])for(const [date,reason] of [['31.02.2027','invalid'],['2020-01-01','past'],['2026-10-25','closed']])test(`safety warning survives ${reason} calendar block (${language})`,async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T08:00:00Z')});
 const warning=warnings[language];
 const {session,body,sends}=await run(date,warning,language,warning);
 assert.ok(body.reply.startsWith(warning),'the already generated warning must remain intact and first');
 const tail=body.reply.slice(warning.length).trim();
 assert.ok(tail.length>20,'calendar clarification is also included');
 if(reason!=='closed')assert.equal(tail,appointmentIssueMessage({reason},language));
 else assert.match(tail,language==='cs'?/zavřeno/:/закрыт/);
 assert.equal(body.confirmationToken,null);assert.equal(session.confirmation,null);
 assert.equal(sends,0);assert.doesNotMatch(body.reply,/Zkontrolujte prosím žádost/);
 assert.equal(session.history.at(-1).content,body.reply,'complete answer is persisted for reload');
});
test('identical model clarification is not repeated',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T08:00:00Z')});
 const text=appointmentIssueMessage({reason:'invalid'},'cs');
 const {body}=await run('31.02.2027',text,'cs');
 assert.equal(body.reply,text);
});
