import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {createRepository} from './storage.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {createChatHandler,createSessionHandler} from './chat-route.mjs';
import {emptyIntakeState} from './intake.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
const userEntry={id:'prior-user',role:'user',content:'Earlier question',at:'2026-10-20T08:00:00.000Z'};
function browserSubmit({initial={},after={},sync,post}={}) {
 const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('form.addEventListener("submit", async (event) => {');
 const end=app.indexOf('\nasync function loadCompany()',start);
 assert.ok(start>=0 && end>start);
 let submit,id=0,clock=0;
 const calls={posts:[],answers:[],focus:0};
 const sessionValues=new Map();
 const classes=new Set();
 const row=()=>{const time={dateTime:'2026-10-20T08:06:00.000Z'};return{querySelector:()=>time,style:{},getAnimations:()=>[],classList:{add(){}},remove(){}};};
 const context={
  sendButton:{disabled:false,classList:{contains:name=>classes.has(name),remove:name=>classes.delete(name)}},
  input:{value:'První dotaz',focus:()=>calls.focus++},
  messages:{querySelectorAll:()=>[]},uiMessages:{invalidMessage:'Invalid message',connectionFailed:'Offline',requestFailed:'Failed'},
  conversationId:'old-session',sessionRevision:0,confirmationToken:null,serverHistoryTailId:null,chatHistory:[],chatGeneration:1,
  recoveredRequestId:null,activeChatPost:false,isAiTyping:false,intakeState:null,
  hideHelpHint(){},updateSuggestions(){},updateLauncherStatus(){},scrollMessagesToBottom(){},resizeMessageInput(){},
  showMessage:()=>row(),showTypingMessage:()=>row(),placeHistoryRow(){},
  finishTypingMessage:(_row,text)=>calls.answers.push(text),
  rememberMessage(role,content,at,messageId){const entry={role,content,at,id:messageId??'message-'+(++id)};context.chatHistory.push(entry);return entry;},
  makeMessageId:()=> 'message-'+(++id),limitMessageLength:text=>text,
  isValidHistoryEntry:entry=>Boolean(entry?.id&&entry?.at&&entry?.content),receiveClientMessages(){},
  PENDING_CHAT_MESSAGE_KEY:'pending',PENDING_CHAT_CONTEXT_KEY:'pending-context',CHAT_INTAKE_KEY:'intake',
  sessionStorage:{setItem:(key,value)=>sessionValues.set(key,value),getItem:key=>sessionValues.get(key)??null,removeItem:key=>sessionValues.delete(key)},
  localStorage:{setItem(){}},setTimeout,performance:{now:()=>clock+=500},AbortSignal:{timeout:()=>undefined},
  form:{addEventListener:(name,callback)=>{assert.equal(name,'submit');submit=callback;}},
  syncServerSession:async()=>{
   if(sync)return sync(context);
   Object.assign(context,{conversationId:'new-session',sessionRevision:0,confirmationToken:null,serverHistoryTailId:null,chatHistory:[],...after});
  },
  fetch:async(url,options)=>{
   assert.equal(url,'/api/chat');assert.equal(options.method,'POST');
   const body=JSON.parse(options.body);calls.posts.push(body);
   if(post)return post(body);
   return{ok:true,json:async()=>({reply:'Odpověď',intake:emptyIntakeState(),revision:context.sessionRevision+1,conversationId:context.conversationId,confirmationToken:null})};
  },
  ...initial,
 };
 vm.runInNewContext(app.slice(start,end),context);
 return{context,calls,submit:()=>submit({preventDefault(){}})};
}
function response(){return Object.assign(new EventEmitter(),{locals:{},statusCode:200,cookie(_name,value){this.cookieValue=value;},set(){},json(body){this.body=body;return this;},status(code){this.statusCode=code;return this;}});}

test('first submit after a five-minute empty-session expiry saves one question and one answer',async t=>{
 const start=Date.parse('2026-10-20T08:00:00Z');let now=start;
 t.mock.method(Date,'now',()=>now);
 const repo=createRepository();let modelCalls=0;
 try{
  const store=createChatSessionStore({repository:repo});
  const sessionHandler=createSessionHandler({getSession:store});
  const initial=response();sessionHandler({headers:{},ip:'test'},initial);
  let cookie=initial.cookieValue;
  const oldId=cookie;
  now=start+300001;
  const chatHandler=createChatHandler({getSession:store,loadCompanyData:async()=>company,replyToMessage:async(_message,_company,_history,intake)=>{modelCalls++;return{kind:'reply',text:'Odpověď',intake,language:'cs',submissionAction:'none',keepClosedDay:false,needsClarification:false};},sendConfirmation:()=>{throw Error('Mail must not be sent');}});
  const browser=browserSubmit({
   initial:{conversationId:initial.body.conversationId,sessionRevision:initial.body.revision},
   sync:async context=>{
    const out=response();sessionHandler({headers:{cookie:'caro_session='+cookie},ip:'test'},out);cookie=out.cookieValue;
    Object.assign(context,{conversationId:out.body.conversationId,sessionRevision:out.body.revision,confirmationToken:out.body.confirmationToken,serverHistoryTailId:out.body.history.at(-1)?.id??null,chatHistory:structuredClone(out.body.history)});
   },
   post:async body=>{const out=response();await chatHandler({headers:{cookie:'caro_session='+cookie},ip:'test',body},out);return{ok:out.statusCode===200,json:async()=>out.body};},
  });
  await browser.submit();
  assert.notEqual(cookie,oldId);
  assert.equal(browser.calls.posts.length,1);
  assert.equal(modelCalls,1);
  assert.equal(browser.calls.posts[0].conversationId,browser.context.conversationId);
  const saved=repo.load(cookie);
  assert.equal(saved.history.length,2);
  assert.equal(saved.history[0].role,'user');assert.equal(saved.history[0].content,'První dotaz');
  assert.equal(saved.history[1].role,'assistant');assert.equal(saved.history[1].content,'Odpověď');
  assert.equal(browser.context.input.value,'');
  assert.equal(browser.context.sendButton.disabled,false);
  assert.deepEqual(browser.calls.answers,['Odpověď']);
 }finally{repo.close();}
});

test('initial synchronization with an empty session does not consume the first submit',async()=>{
 const browser=browserSubmit({initial:{conversationId:null,sessionRevision:null}});
 await browser.submit();assert.equal(browser.calls.posts.length,1);assert.equal(browser.context.input.value,'');
});
test('an unchanged existing conversation still sends normally',async()=>{
 const browser=browserSubmit({initial:{sessionRevision:2,serverHistoryTailId:userEntry.id,chatHistory:[userEntry]},after:{conversationId:'old-session',sessionRevision:2,serverHistoryTailId:userEntry.id,chatHistory:[userEntry]}});
 await browser.submit();assert.equal(browser.calls.posts.length,1);
});
for(const [name,initial,after] of [
 ['an existing conversation is replaced',{sessionRevision:2,serverHistoryTailId:userEntry.id,chatHistory:[userEntry]},{}],
 ['the synchronized conversation already contains messages',{}, {serverHistoryTailId:userEntry.id,chatHistory:[userEntry]}],
 ['the draft revision changes',{}, {conversationId:'old-session',sessionRevision:1}],
 ['the confirmation token changes',{sessionRevision:2,confirmationToken:'old-token'}, {conversationId:'old-session',sessionRevision:2,confirmationToken:'new-token'}],
 ['the user resets the chat during synchronization',{}, {chatGeneration:2}],
])test('state-change protection remains when '+name,async()=>{
 const browser=browserSubmit({initial,after});await browser.submit();
 assert.equal(browser.calls.posts.length,0);assert.equal(browser.context.input.value,'První dotaz');assert.equal(browser.context.sendButton.disabled,false);
});
test('a synchronization failure keeps the message available for a deliberate retry',async()=>{
 const browser=browserSubmit({sync:async()=>{throw Error('Offline');}});
 await browser.submit();assert.equal(browser.calls.posts.length,0);assert.equal(browser.context.input.value,'První dotaz');assert.equal(browser.context.sendButton.disabled,false);
});
