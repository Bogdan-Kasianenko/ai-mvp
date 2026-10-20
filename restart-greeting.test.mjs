import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRepository} from './storage.mjs';
import {createChatSessionStore,prepareConfirmation} from './chat-session.mjs';
import {createSessionHandler,createChatHandler} from './chat-route.mjs';
import {previousSentRequest,chatSessionSnapshot} from './pending-chat.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function response(){const res=new EventEmitter();res.code=200;res.cookie=()=>{};res.set=()=>res;res.status=code=>(res.code=code,res);res.json=body=>(res.body=body,res.writableEnded=true,res);return res;}
function harness(status){
 const repo=createRepository();
 const store=createChatSessionStore({repository:repo});
 const session=store({headers:{},ip:'test'},response());
 session.history=[{id:'old',role:'user',content:'Old conversation',at:new Date().toISOString()}];
 session.intake.requestedWork='Previous oil change';
 if(status){repo.reserve('old-delivery',session.id,session.intake);repo.finish('old-delivery',status);session.lastDelivery='old-delivery';}
 prepareConfirmation(session);session.persist();
 const request={headers:{cookie:`caro_session=${session.id}`},ip:'test'};
 const reset=()=>{const res=response();createSessionHandler({getSession:()=>session,reset:true})(request,res);return res.body;};
 return {repo,session,request,reset};
}
test('reset without sent request has a new-chat introduction and no previous-request offer',()=>{
 const h=harness();try{const data=h.reset();assert.match(data.restartGreeting,/nový rozhovor/);assert.doesNotMatch(data.restartGreeting,/předchozí/);assert.deepEqual(data.history,[]);assert.equal(data.confirmationToken,null);}finally{h.repo.close();}
});
test('reset after successful sending preserves a reference, clears consent and offers an addition',()=>{
 const h=harness('sent');try{
  const oldRequestId=h.session.requestId;const data=h.reset();
  assert.match(data.restartGreeting,/předchozí odeslané žádosti/);
  assert.notEqual(data.conversationId,oldRequestId);assert.equal(data.confirmationToken,null);
  assert.equal(h.session.lastDelivery,null);assert.equal(h.session.previousDelivery,'old-delivery');
  assert.equal(h.repo.delivery('old-delivery').status,'sent');
  assert.equal(data.intake.requestedWork,null);
  assert.equal(previousSentRequest(h.session).intake.requestedWork,'Previous oil change');
  assert.equal(h.reset().restartGreeting,data.restartGreeting,'repeated reset retains the sent-request reference');
 }finally{h.repo.close();}
});
for(const state of ['pending','failed','unknown'])test('no sent-request offer for delivery state '+state,()=>{
 const h=harness(state);try{assert.doesNotMatch(h.reset().restartGreeting,/předchozí/);assert.equal(previousSentRequest(h.session),null);}finally{h.repo.close();}
});
test('previous-request details cannot be borrowed from another session',()=>{
 const h=harness('sent');try{h.session.id='other-session';h.session.previousDelivery='old-delivery';h.session.restarted=true;assert.equal(previousSentRequest(h.session),null);assert.doesNotMatch(chatSessionSnapshot(h.session).restartGreeting,/předchozí/);}finally{h.repo.close();}
});
test('restart greeting and sent reference survive reloading the session from the database',()=>{
 const h=harness('sent');try{
  const expected=h.reset().restartGreeting;
  const next=createChatSessionStore({repository:h.repo})(h.request,response());
  assert.equal(chatSessionSnapshot(next).restartGreeting,expected);
  const snapshot=previousSentRequest(next);snapshot.intake.requestedWork='mutated';
  assert.equal(h.repo.delivery('old-delivery').data.requestedWork,'Previous oil change');
 }finally{h.repo.close();}
});
test('model receives previous sent context after reset without auto-sending or filling new draft',async()=>{
 const h=harness('sent');try{
  h.reset();let context;
  const handler=createChatHandler({getSession:()=>h.session,loadCompanyData:async()=>company,
   replyToMessage:async(...args)=>{context=args[8];assert.equal(args[3].requestedWork,null);return {kind:'unavailable'};},
   sendConfirmation:()=>assert.fail('Must not send automatically')});
  await handler({...h.request,body:{message:'ano'}},response());
  assert.equal(context.previousSentRequest.deliveryId,'old-delivery');
  assert.equal(context.previousSentRequest.intake.requestedWork,'Previous oil change');
 }finally{h.repo.close();}
});
test('ordinary first chat keeps the original welcome path',()=>{
 const h=harness();try{assert.equal(chatSessionSnapshot(h.session).restartGreeting,null);}finally{h.repo.close();}
});
