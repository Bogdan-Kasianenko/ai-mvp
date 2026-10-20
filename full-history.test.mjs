import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createChatHandler,createSessionHandler} from './chat-route.mjs';
import {emptyIntakeState} from './intake.mjs';
import {createRepository} from './storage.mjs';
const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
const response=()=>Object.assign(new EventEmitter(),{locals:{},writableEnded:false,json(body){this.body=body;return this;},status(code){this.code=code;return this;},set(){}});
for(const size of [50,1200])test('full transcript survives replies and session restoration with '+size+' characters per message',async()=>{
 const repository=createRepository();
 const initial=Array.from({length:120},(_,i)=>({role:i%2?'assistant':'user',content:String(i)+':'+ 'x'.repeat(size),id:'old-'+i,at:new Date(Date.now()-120000+i).toISOString()}));
 const session={id:'history-session',intake:emptyIntakeState(),revision:0,history:structuredClone(initial),language:'cs',requestId:'full-history',confirmation:null,lastDelivery:null,expiresAt:Date.now()+86400000,repository:{activeCount:()=>0,allow:()=>true,allowMany:()=>true},acquire:()=>true,release(){},persist(){repository.save(this);}};
 let received;
 const handler=createChatHandler({getSession:()=>session,loadCompanyData:async()=>company,replyToMessage:async(_m,_c,history,intake)=>{received=history;return{kind:'reply',text:'Odpověď',intake,language:'cs',priceQuoted:false,keepClosedDay:false,needsClarification:false,submissionAction:'none'};},sendConfirmation:()=>{throw Error('No mail expected');}});
 try{
  const reply=response();await handler({body:{message:'další dotaz',messageId:'new-history-message'},ip:'test'},reply);
  assert.equal(reply.code,undefined);
  assert.equal(session.history.length,122);
  assert.deepEqual(session.history.slice(0,120),initial);
  assert.ok(received.length<=30);
  assert.ok(received.reduce((n,e)=>n+e.content.length,0)<=24000);
  assert.equal(received.at(-1).content,initial.at(-1).content);
  const loaded=repository.load(session.id);assert.equal(loaded.history.length,122);
  const restored=response();createSessionHandler({getSession:()=>({...session,...loaded})})({},restored);
  assert.equal(restored.body.history.length,122);
  assert.equal(restored.body.history[0].id,'old-0');
 }finally{repository.close();}
});
test('browser restores more than fifty saved messages',()=>{
 const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function readStoredHistory('),end=app.indexOf('function migrateOldHistory(',start);
 const saved=Array.from({length:120},(_,i)=>({id:'row-'+i,role:i%2?'assistant':'user',content:'message '+i,at:new Date(Date.now()-120000+i).toISOString()}));
 const keys=saved.map(e=>'entry-'+e.id);
 const context={CHAT_HISTORY_KEY:'old',CHAT_MESSAGE_PREFIX:'entry-',normalizeHistoryEntry:e=>e,compareHistoryEntries:(a,b)=>Date.parse(a.at)-Date.parse(b.at),localStorage:{length:keys.length,key:i=>keys[i],getItem:key=>key==='old'?null:JSON.stringify(saved[keys.indexOf(key)])}};
 vm.runInNewContext(app.slice(start,end)+'\nthis.read=readStoredHistory;',context);
 assert.equal(context.read().length,120);
 assert.equal(context.read()[0].id,'row-0');
});

function browserHistoryHarness(nearBottom = true) {
 const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const readStart=app.indexOf('function readStoredHistory(');
 const readEnd=app.indexOf('function migrateOldHistory(',readStart);
 const refreshStart=app.indexOf('function refreshChatHistory()');
 const refreshEnd=app.indexOf('\nmigrateOldHistory();',refreshStart);
 const eventStart=app.indexOf('window.addEventListener("storage", (event) => {');
 const eventEnd=app.indexOf('\nasync function syncServerSession()',eventStart);
 for(const [start,end] of [[readStart,readEnd],[refreshStart,refreshEnd],[eventStart,eventEnd]]) {
  assert.ok(start>=0 && end>start,'Browser history entry points must be present');
 }
 const initial=Array.from({length:120},(_,i)=>({id:'row-'+i,role:i%2?'assistant':'user',content:'message '+i,at:new Date(Date.UTC(2026,9,20,10,0,0)+i).toISOString()}));
 const stored=new Map(initial.map(entry=>['entry-'+entry.id,JSON.stringify(entry)]));
 const calls={rows:[],scrolls:0,unread:0,expiry:0,suggestions:0};
 let onStorage;
 const context={
  CHAT_HISTORY_KEY:'legacy',CHAT_MESSAGE_PREFIX:'entry-',CHAT_RESET_KEY:'reset',CHAT_LAST_READ_KEY:'last-read',CHAT_INTAKE_KEY:'intake',
  chatHistory:structuredClone(initial),isAiTyping:false,chatUiState:{open:true},chatPanel:{hidden:false},
  normalizeHistoryEntry:entry=>entry,
  compareHistoryEntries:(a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id),
  localStorage:{get length(){return stored.size;},key:index=>[...stored.keys()][index],getItem:key=>stored.get(key)??null},
  expireChatHistoryIfNeeded:()=>false,isNearMessagesBottom:()=>nearBottom,
  showMessage:(author,content,at,restored)=>({author,content,at,restored}),
  placeHistoryRow:(row,entry)=>calls.rows.push({row,id:entry.id}),
  requestAnimationFrame:callback=>callback(),scrollMessagesToBottom:()=>calls.scrolls++,
  syncUnreadCount:()=>calls.unread++,scheduleHistoryExpiry:()=>calls.expiry++,updateSuggestions:()=>calls.suggestions++,
  window:{addEventListener:(name,callback)=>{assert.equal(name,'storage');onStorage=callback;}},
 };
 vm.runInNewContext(app.slice(readStart,readEnd)+'\n'+app.slice(refreshStart,refreshEnd)+'\n'+app.slice(eventStart,eventEnd),context);
 assert.equal(typeof onStorage,'function');
 return {context,calls,initial,store(entry){stored.set('entry-'+entry.id,JSON.stringify(entry));},notify(entry){onStorage({key:'entry-'+entry.id,newValue:JSON.stringify(entry)});}};
}

test('another tab merges new messages without errors, duplicates or truncating history',()=>{
 const browser=browserHistoryHarness();
 const user={id:'new-user',role:'user',content:'Nový dotaz',at:'2026-10-20T10:00:01.000Z'};
 const assistant={id:'new-assistant',role:'assistant',content:'Nová odpověď',at:'2026-10-20T10:00:02.000Z'};
 // Storage order differs from conversation order, and one event may reveal both rows.
 browser.store(assistant);browser.store(user);
 assert.doesNotThrow(()=>browser.notify(assistant));
 assert.equal(browser.context.chatHistory.length,122);
 assert.equal(browser.context.chatHistory[0].id,'row-0');
 assert.deepEqual(Array.from(browser.context.chatHistory,entry=>entry.id),[...browser.initial.map(entry=>entry.id),'new-user','new-assistant']);
 assert.deepEqual(browser.calls.rows.map(row=>row.id),['new-user','new-assistant']);
 assert.ok(browser.calls.rows.every(({row})=>row.restored===true));
 assert.equal(browser.calls.scrolls,1);
 assert.equal(browser.calls.unread,1);assert.equal(browser.calls.expiry,1);assert.equal(browser.calls.suggestions,1);
 assert.doesNotThrow(()=>browser.notify(assistant));
 assert.equal(browser.context.chatHistory.length,122);
 assert.equal(browser.calls.rows.length,2);
 assert.equal(browser.calls.scrolls,1);
});

test('another tab does not force scrolling when the reader is above the bottom',()=>{
 const browser=browserHistoryHarness(false);
 const entry={id:'new-answer',role:'assistant',content:'Další odpověď',at:'2026-10-20T10:00:01.000Z'};
 browser.store(entry);
 assert.doesNotThrow(()=>browser.notify(entry));
 assert.equal(browser.context.chatHistory.length,121);
 assert.equal(browser.calls.rows[0].id,entry.id);
 assert.equal(browser.calls.scrolls,0);
 assert.equal(browser.calls.unread,1);
});
