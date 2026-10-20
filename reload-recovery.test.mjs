import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createChatHandler,createSessionHandler} from './chat-route.mjs';
import {createChatSessionStore,prepareConfirmation} from './chat-session.mjs';
import {createRepository} from './storage.mjs';
import {beginPendingChat} from './pending-chat.mjs';
import {handleSendConfirmation} from './request-flow.mjs';
import {emptyIntakeState} from './intake.mjs';
import {createApp} from './app.mjs';
import {once} from 'node:events';
import vm from 'node:vm';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
function response(){return Object.assign(new EventEmitter(),{locals:{},writableEnded:false,destroyed:false,cookie(){},set(){},json(body){this.body=body;return this;},status(code){this.code=code;return this;}});}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function harness(){
 const repository=createRepository();const store=createChatSessionStore({repository});
 const first=store({headers:{}},response());
 const request=body=>({headers:{cookie:'caro_session='+first.id},ip:'test',body});
 const entered=deferred(),finish=deferred();let calls=0,signal;
 const handler=createChatHandler({getSession:store,loadCompanyData:async()=>company,replyToMessage:async(_message,_company,_history,intake,currentSignal)=>{calls++;signal=currentSignal;entered.resolve();const kind=await finish.promise;if(kind instanceof Error)throw kind;return kind==='unavailable'?{kind}:{kind:'reply',text:'Hotová odpověď',intake,language:'cs',submissionAction:'none'};},sendConfirmation:()=>{throw Error('Unexpected mail');}});
 return{repository,store,first,request,entered,finish,handler,get calls(){return calls;},get signal(){return signal;}};
}
test('disconnect keeps accepted user message and processing alive; status reads do not release the job lock',async()=>{
 const h=harness();const out=response();const task=h.handler(h.request({message:'Dotaz',messageId:'reload-once'}),out);
 try{
  await h.entered.promise;
  assert.equal(h.repository.load(h.first.id).history[0].content,'Dotaz');
  out.destroyed=true;out.emit('close');assert.equal(h.signal.aborted,false);
  const view=response();createSessionHandler({getSession:h.store})(h.request(),view);
  assert.equal(view.code,undefined);assert.equal(view.body.pendingRequest.id,'reload-once');assert.equal(view.body.history.length,1);
  assert.equal(h.repository.activeCount(),1);
  h.finish.resolve();await task;
  const done=response();createSessionHandler({getSession:h.store})(h.request(),done);
  assert.equal(done.body.pendingRequest,null);assert.equal(done.body.history.length,2);assert.equal(done.body.history[1].content,'Hotová odpověď');
  assert.equal(out.body,undefined);assert.equal(h.calls,1);assert.equal(h.repository.activeCount(),0);
 }finally{h.finish.resolve();await task;h.repository.close();}
});
test('repeated message IDs cannot duplicate a running or completed request',async()=>{
 const h=harness();const body={message:'Dotaz',messageId:'idempotent-reload'};const task=h.handler(h.request(body),response());
 try{
  await h.entered.promise;
  const busy=response();await h.handler(h.request(body),busy);assert.equal(busy.code,409);
  h.finish.resolve();await task;
  const cached=response();await h.handler(h.request(body),cached);assert.equal(cached.body.reply,'Hotová odpověď');assert.equal(h.calls,1);
  assert.equal(h.repository.load(h.first.id).history.length,2);
  const reused=response();await h.handler(h.request({...body,message:'Different'}),reused);assert.equal(reused.code,409);
 }finally{h.finish.resolve();await task;h.repository.close();}
});
test('another store can read pending work without cancelling it; reset stays blocked',async()=>{
 const h=harness();const task=h.handler(h.request({message:'Dotaz',messageId:'cross-store'}),response());
 try{
  await h.entered.promise;const second=createChatSessionStore({repository:h.repository});
  const view=response();createSessionHandler({getSession:second})(h.request(),view);
  assert.equal(view.body.pendingRequest.id,'cross-store');assert.equal(h.repository.activeCount(),1);
  const reset=response();createSessionHandler({getSession:second,reset:true})(h.request(),reset);assert.equal(reset.code,409);
  h.finish.resolve();await task;
  const restored=response();createSessionHandler({getSession:second})(h.request(),restored);
  assert.equal(restored.body.history.length,2);assert.equal(restored.body.pendingRequest,null);
 }finally{h.finish.resolve();await task;h.repository.close();}
});
for(const kind of ['unavailable','throw'])test('failed processing keeps the user message and clears waiting: '+kind,async()=>{
 const h=harness();const out=response();out.destroyed=true;const task=h.handler(h.request({message:'Dotaz',messageId:'failure-'+kind}),out);
 try{
  await h.entered.promise;h.finish.resolve(kind==='throw'?new Error('Fake failure'):'unavailable');await task;
  const stored=h.repository.load(h.first.id);assert.equal(stored.pendingRequest,null);assert.equal(stored.history.length,2);assert.equal(stored.history[0].content,'Dotaz');assert.ok(stored.history[1].content);assert.equal(h.repository.activeCount(),0);
 }finally{h.finish.resolve();await task;h.repository.close();}
});
test('orphaned persisted work becomes a visible failure without an automatic AI or mail retry',()=>{
 const h=harness();
 try{
  assert.equal(h.first.acquire(),true);beginPendingChat(h.first,'Pending before restart','orphan');h.first.release();
  const view=response();createSessionHandler({getSession:h.store})(h.request(),view);
  assert.equal(view.body.pendingRequest,null);assert.equal(view.body.history.length,2);assert.equal(h.calls,0);
 }finally{h.repository.close();}
});
test('disconnect after explicit send consent cannot duplicate delivery',async()=>{
 const h=harness();let sends=0;const finish=deferred(),entered=deferred();
 try{
  const state=emptyIntakeState();Object.assign(state,{intent:'service_request', selectedOperations: ["oil_filters:engine_oil"], serviceId:'oil_filters',serviceOptionId:'engine_oil',requestedWork:'Výměna oleje',customerParts:true,oilFilterScopeReviewed:true,additionalServicesReviewed:true,preferredTime:'2026-10-26'});Object.assign(state.vehicle,{brand:'Suzuki',model:'Swift',year:'2018'});Object.assign(state.customer,{name:'Test',email:'test@example.com'});
  h.first.intake=state;const token=prepareConfirmation(h.first);h.first.persist();
  const handler=createChatHandler({getSession:h.store,loadCompanyData:async()=>company,replyToMessage:async(_m,_c,_h,intake)=>{entered.resolve();await finish.promise;return{kind:'reply',text:'Ano',intake,language:'cs',submissionAction:'confirm_send'};},sendConfirmation:args=>handleSendConfirmation({...args,sendRequest:async()=>{sends++;}})});
  const body={message:'ano',messageId:'consent-once',confirmationToken:token};const out=response();const task=handler(h.request(body),out);await entered.promise;out.destroyed=true;out.emit('close');finish.resolve();await task;
  assert.equal(sends,1);
  const repeated=response();await handler(h.request(body),repeated);assert.equal(sends,1);assert.match(repeated.body.reply,/odeslána/);
 }finally{finish.resolve();h.repository.close();}
});

test('aborting a real HTTP connection still produces one saved answer',async()=>{
 const store=createChatSessionStore();const started=deferred(),finish=deferred();let calls=0;
 const app=createApp({chatOptions:{getSession:store,replyToMessage:async(_m,_c,_h,intake)=>{calls++;started.resolve();await finish.promise;return{kind:'reply',text:'Recovered over HTTP',intake,language:'cs',submissionAction:'none'};},sendConfirmation:()=>{throw Error('No mail');}},sessionOptions:{getSession:store}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 try{
  const initial=await fetch(url+'/api/session');const cookie=initial.headers.get('set-cookie').split(';')[0];
  const controller=new AbortController();
  const request=fetch(url+'/api/chat',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({message:'HTTP reload',messageId:'http-reload'}),signal:controller.signal}).catch(error=>error);
  await started.promise;controller.abort();await request;
  const pending=await(await fetch(url+'/api/session',{headers:{Cookie:cookie}})).json();assert.equal(pending.pendingRequest.id,'http-reload');assert.equal(pending.history[0].content,'HTTP reload');
  finish.resolve();
  let complete;
  for(let i=0;i<20;i++){
    complete=await(await fetch(url+'/api/session',{headers:{Cookie:cookie}})).json();
    if(!complete.pendingRequest)break;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.equal(complete.pendingRequest,null);assert.equal(complete.history.length,2);assert.equal(complete.history[1].content,'Recovered over HTTP');assert.equal(calls,1);
 }finally{finish.resolve();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

function browserHarness(){
 let typing=0,timer=null;const storage=new Map();const classes=new Set();
 const context={isAiTyping:false,sendButton:{disabled:false,classList:{add(v){classes.add(v);},remove(v){classes.delete(v);},toggle(v,enabled){if(enabled)classes.add(v);else classes.delete(v);},contains(v){return classes.has(v);}}},showTypingMessage(){typing++;return{isConnected:true,remove(){this.isConnected=false;}};},updateLauncherStatus(){},updateSuggestions(){},setTimeout(cb){timer=cb;return 1;},clearTimeout(){timer=null;},document:{visibilityState:'visible'},sessionStorage:{getItem:key=>storage.get(key)??null,removeItem:key=>storage.delete(key)},PENDING_CHAT_MESSAGE_KEY:'pending',chatUiState:{open:false},chatPanel:{hidden:true},input:{focus(){}},syncServerSession:async()=>{}};
 context.CHAT_HISTORY_LIFETIME=86400000;context.isValidHistoryEntry=entry=>entry?.role==='user'&&Boolean(entry.id)&&Boolean(entry.content)&&Number.isFinite(Date.parse(entry.at));
 const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('let activeChatPost = false;'),app.indexOf('let welcomeTask = null;'));
 vm.runInNewContext(source+'\nthis.api={recoverPendingRequest,readUnacknowledgedMessage,active(value){activeChatPost=value;},pending:()=>recoveredRequestId};',context);
 return{context,storage,get typing(){return typing;},get timer(){return timer;}};
}
test('browser polling restores one typing row and unlocks the form after completion',()=>{
 const h=browserHarness();const data={pendingRequest:{id:'request'},history:[{id:'request'}]};h.storage.set('pending','request');
 h.context.api.recoverPendingRequest(data);h.context.api.recoverPendingRequest(data);
 assert.equal(h.typing,1);assert.equal(h.context.sendButton.disabled,true);assert.equal(h.context.isAiTyping,true);assert.ok(h.timer);
 h.context.api.recoverPendingRequest({...data,pendingRequest:null,history:[{id:'request'},{id:'answer'}]});
 assert.equal(h.timer,null);assert.equal(h.context.sendButton.disabled,false);assert.equal(h.context.isAiTyping,false);assert.equal(h.storage.has('pending'),false);
});
test('browser recovery does not compete with the original live POST',()=>{
 const h=browserHarness();h.context.api.active(true);h.context.api.recoverPendingRequest({pendingRequest:{id:'request'},history:[]});assert.equal(h.typing,0);assert.equal(h.timer,null);
});
test('a failed status read schedules another read without resending the message',async()=>{
 const h=browserHarness();let reads=0;h.context.syncServerSession=async()=>{reads++;throw Error('Connection lost');};
 h.context.api.recoverPendingRequest({pendingRequest:{id:'request'},history:[]});await h.timer();assert.equal(reads,1);assert.ok(h.timer);assert.equal(h.context.api.pending(),'request');
});
test('a locally saved message not accepted by the server is kept for the same conversation only',()=>{
 const h=browserHarness();const entry={id:'not-accepted',role:'user',content:'My question',at:new Date().toISOString()};
 h.storage.set('pending',entry.id);h.storage.set('autoservice-chat-pending-context-v1',JSON.stringify({conversationId:'current',entry}));
 assert.equal(h.context.api.readUnacknowledgedMessage({conversationId:'current',history:[]}).content,'My question');
 assert.equal(h.context.api.readUnacknowledgedMessage({conversationId:'new',history:[]}),null);
 assert.equal(h.context.api.readUnacknowledgedMessage({conversationId:'current',history:[entry]}),null);
});
test('expired unaccepted messages are not brought back after 24 hours',()=>{
 const h=browserHarness();const entry={id:'expired',role:'user',content:'Old question',at:new Date(Date.now()-86400001).toISOString()};
 h.storage.set('pending',entry.id);h.storage.set('autoservice-chat-pending-context-v1',JSON.stringify({conversationId:'current',entry}));
 assert.equal(h.context.api.readUnacknowledgedMessage({conversationId:'current',history:[]}),null);
});

for (const [label, animateSend, expected] of [["FAQ",false,false],["manual send",true,true],["unknown source",undefined,false]]) {
  test("reload preserves send-button behavior for " + label, () => {
    const h=browserHarness();
    h.storage.set("autoservice-chat-pending-context-v1",JSON.stringify({conversationId:"current",entry:{id:"question"},animateSend}));
    h.context.api.recoverPendingRequest({conversationId:"current",pendingRequest:{id:"question"},history:[{id:"question"}]});
    assert.equal(h.context.sendButton.classList.contains("is-sending"),expected);
    assert.equal(h.context.sendButton.disabled,true);
    assert.equal(h.typing,1);
    h.context.api.recoverPendingRequest({conversationId:"current",pendingRequest:null,history:[{id:"question"},{id:"answer"}]});
    assert.equal(h.context.sendButton.classList.contains("is-sending"),false);
  });
}
