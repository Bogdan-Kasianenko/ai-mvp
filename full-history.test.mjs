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
 const session={id:'history-session',intake:emptyIntakeState(),revision:0,history:structuredClone(initial),language:'cs',requestId:'full-history',confirmation:null,lastDelivery:null,expiresAt:Date.now()+86400000,repository:{activeCount:()=>0,allow:()=>true},acquire:()=>true,release(){},persist(){repository.save(this);}};
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
