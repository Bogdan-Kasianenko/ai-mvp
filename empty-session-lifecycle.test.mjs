import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createRepository} from './storage.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {createSessionHandler} from './chat-route.mjs';
import {emptyIntakeState} from './intake.mjs';
const start=Date.parse('2026-10-20T08:00:00Z'),emptyTtl=300000,day=86400000;
function response(){return Object.assign(new EventEmitter(),{locals:{},cookie(){},set(){},json(body){this.body=body;return this;},status(code){this.code=code;return this;}});}
const request=id=>({headers:{cookie:id?'caro_session='+id:''},ip:'test'});
const get=(store,id)=>store(request(id),response());
function legacy(id,expires=start+day,extra={}){return{id,history:[],expiresAt:expires,...extra};}
function seed(path,rows){
 createRepository(path).close();const db=new DatabaseSync(path);
 try{
  db.exec('BEGIN IMMEDIATE');
  const insert=db.prepare('INSERT INTO sessions(id,data,expires,locked_until) VALUES(?,?,?,?)');
  for(const row of rows)insert.run(row.id,JSON.stringify(row),row.expiresAt,row.lockedUntil??0);
  db.exec('COMMIT');
 }finally{db.close();}
}
function database(){const dir=mkdtempSync(join(tmpdir(),'caro-empty-lifecycle-'));return{path:join(dir,'test.sqlite'),remove(){rmSync(dir,{recursive:true,force:true});}};}

test('reset near the end of an empty session grants five new minutes without polling extensions',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo});const first=get(store);
  now=start+240000;const out=response();createSessionHandler({getSession:store,reset:true})(request(first.id),out);
  const deadline=now+emptyTtl;assert.equal(repo.load(first.id).emptyExpiresAt,deadline);assert.equal(repo.load(first.id).expiresAt,deadline);
  now=start+300001;assert.equal(get(store,first.id).id,first.id,'the old deadline must no longer apply');
  now=deadline-1;createSessionHandler({getSession:store})(request(first.id),response());assert.equal(repo.load(first.id).expiresAt,deadline);
  now=deadline;assert.notEqual(get(store,first.id).id,first.id);
 }finally{repo.close();}
});
test('reset after sending retains the previous request but expires the empty conversation in five minutes',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo});const first=get(store);
  first.history.push({role:'user',content:'Test',id:'old-message',at:new Date(now).toISOString()});
  repo.reserve('sent-request',first.id,emptyIntakeState());repo.finish('sent-request','sent');first.lastDelivery='sent-request';first.persist();
  now=start+240000;const out=response();createSessionHandler({getSession:store,reset:true})(request(first.id),out);
  const saved=repo.load(first.id);assert.equal(saved.previousDelivery,'sent-request');assert.equal(saved.lastDelivery,null);assert.equal(saved.expiresAt,now+emptyTtl);
  assert.match(out.body.restartGreeting,/předchozí odeslané žádosti/);
  now+=60000;const restored=response();createSessionHandler({getSession:store})(request(first.id),restored);
  assert.match(restored.body.restartGreeting,/předchozí odeslané žádosti/);assert.equal(repo.load(first.id).expiresAt,start+240000+emptyTtl);
  now=start+240000+emptyTtl;assert.notEqual(get(store,first.id).id,first.id);
  assert.equal(repo.delivery('sent-request').status,'sent','expiring a chat must not delete or resend its request');
 }finally{repo.close();}
});
test('the first user message after reset restores the normal twenty-four-hour conversation lifetime',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo});const first=get(store);
  now+=240000;createSessionHandler({getSession:store,reset:true})(request(first.id),response());
  const session=get(store,first.id);session.history.push({role:'user',content:'New question'});session.persist();
  assert.equal(repo.load(first.id).expiresAt,now+day);
  now+=emptyTtl+1;const same=get(store,first.id);assert.equal(same.id,first.id);assert.equal(same.acquire(),true);same.release();assert.equal(repo.load(first.id).expiresAt,now+day);
 }finally{repo.close();}
});
test('opening an old database frees capacity occupied by a thousand expired legacy empty sessions',t=>{
 t.mock.method(Date,'now',()=>start);const file=database();let repo;
 try{
  seed(file.path,Array.from({length:1000},(_,i)=>legacy('old-'+i,start-600000+day)));
  repo=createRepository(file.path);assert.equal(repo.sessionCount(),0);
  const session=get(createChatSessionStore({repository:repo}));assert.ok(session.id);assert.equal(repo.sessionCount(),1);
 }finally{repo?.close();file.remove();}
});
test('fresh legacy empty sessions receive a persistent deadline that another restart cannot extend',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const file=database();let repo;
 try{
  seed(file.path,[legacy('fresh',start+day,{previousDelivery:'old-request',restarted:true})]);
  repo=createRepository(file.path);const first=repo.load('fresh');
  assert.equal(first.expiresAt,start+emptyTtl);assert.equal(first.emptyExpiresAt,start+emptyTtl);assert.equal(first.previousDelivery,'old-request');
  repo.close();repo=null;now+=120000;repo=createRepository(file.path);
  assert.equal(repo.load('fresh').expiresAt,start+emptyTtl);
 }finally{repo?.close();file.remove();}
});
test('migration preserves an already shorter deadline rather than giving an empty session more time',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const file=database();let repo;
 try{
  seed(file.path,[legacy('short',start+day,{emptyExpiresAt:start+60000})]);
  repo=createRepository(file.path);assert.equal(repo.load('short').expiresAt,start+60000);
  now+=60000;repo.cleanup();assert.equal(repo.sessionCount(),0);
 }finally{repo?.close();file.remove();}
});
test('migration respects active leases and revisits empty legacy rows once the lease expires',t=>{
 let now=start;t.mock.method(Date,'now',()=>now);const file=database();let repo;
 try{
  const expires=start-600000+day;
  seed(file.path,[legacy('leased',expires,{lockedUntil:start+120000})]);
  repo=createRepository(file.path);assert.equal(repo.load('leased').expiresAt,expires);
  now+=119999;repo.cleanup();assert.equal(repo.sessionCount(),1);
  now++;repo.cleanup();assert.equal(repo.sessionCount(),0);
 }finally{repo?.close();file.remove();}
});
test('migration keeps real history, current deliveries and pending processing unchanged',t=>{
 t.mock.method(Date,'now',()=>start);const file=database();let repo;
 try{
  const rows=[legacy('history',start+day,{history:[{role:'user',content:'Keep this'}]}),legacy('delivery',start+day,{lastDelivery:'current-request'}),legacy('pending',start+day,{pendingRequest:{id:'processing'}})];
  seed(file.path,rows);repo=createRepository(file.path);
  for(const row of rows)assert.deepEqual(repo.load(row.id),row);
 }finally{repo?.close();file.remove();}
});
