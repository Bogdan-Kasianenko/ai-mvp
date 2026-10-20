import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRepository} from './storage.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {createSessionHandler} from './chat-route.mjs';
import {EventEmitter} from 'node:events';
const start=Date.parse('2026-10-20T08:00:00Z');
function response(){return Object.assign(new EventEmitter(),{cookie(){},set(){},json(body){this.body=body;return this;},status(){return this;}});}
function get(store,ip='test',id){return store({headers:{cookie:id?`caro_session=${id}`:''},ip},response());}
test('the audit pattern of thirty fresh sessions per minute hits the hourly limit',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  for(let minute=0;minute<2;minute++){Date.now.mock.mockImplementation(()=>start+minute*60001);for(let i=0;i<30;i++)get(store);}
  Date.now.mock.mockImplementation(()=>start+120002);
  assert.throws(()=>get(store),e=>e.code==='SESSION_CREATION_LIMIT'&&e.status===429);
  assert.equal(repo.sessionCount(),60);
 }finally{repo.close();}
});
test('daily quota remains after advancing more than one hour',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  for(let i=0;i<200;i++){
   Date.now.mock.mockImplementation(()=>start+Math.floor(i/50)*3600001+(i%50>=25?60001:0));
   get(store);
  }
  Date.now.mock.mockImplementation(()=>start+4*3600001);
  assert.throws(()=>get(store),e=>e.code==='SESSION_CREATION_LIMIT');
  assert.doesNotThrow(()=>get(store,'different-source'));
 }finally{repo.close();}
});
test('empty session deadline is absolute and cookies cannot extend it',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  const first=get(store);assert.equal(first.expiresAt,start+300000);
  for(let minute=1;minute<5;minute++){
   Date.now.mock.mockImplementation(()=>start+minute*60000);
   const same=get(store,'test',first.id);assert.equal(same.id,first.id);
   assert.equal(same.acquire(),true);same.release();
   assert.equal(same.expiresAt,start+300000);
  }
  Date.now.mock.mockImplementation(()=>start+300001);
  assert.notEqual(get(store,'test',first.id).id,first.id);
  assert.equal(repo.sessionCount(),1);
 }finally{repo.close();}
});
test('a real conversation keeps twenty-four hours after its latest activity',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  const first=get(store);first.history.push({role:'user',id:'test',at:new Date().toISOString(),content:'Hello'});first.persist();
  assert.equal(first.expiresAt,start+86400000);
  Date.now.mock.mockImplementation(()=>start+3600000);
  const same=get(store,'test',first.id);assert.equal(same.id,first.id);same.acquire();same.release();
  assert.equal(same.expiresAt,start+3600000+86400000);
 }finally{repo.close();}
});
test('reset of an old conversation receives a fresh empty deadline',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  const first=get(store);first.history.push({role:'user',content:'Hello'});first.persist();
  Date.now.mock.mockImplementation(()=>start+3600000);
  const handler=createSessionHandler({getSession:store,reset:true});
  handler({headers:{cookie:`caro_session=${first.id}`},ip:'test'},response());
  const saved=repo.load(first.id);assert.deepEqual(saved.history,[]);assert.equal(saved.expiresAt,start+3600000+300000);
 }finally{repo.close();}
});
test('distributed empty-session creation cannot reproduce the thousand-session audit exhaustion',t=>{
 t.mock.method(Date,'now',()=>start);const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  for(let minute=0;minute<35;minute++){
   Date.now.mock.mockImplementation(()=>start+minute*60001);
   for(let i=0;i<120;i++)get(store,`source-${minute}-${i}`);
   assert.ok(repo.sessionCount()<=600,'expired empty sessions must be cleaned before allocation');
  }
 }finally{repo.close();}
});
test('long creation budgets survive restarting the database',t=>{
 t.mock.method(Date,'now',()=>start);const dir=mkdtempSync(join(tmpdir(),'caro-long-quota-'));let repo=createRepository(join(dir,'test.sqlite'));
 try{
  let store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  for(let i=0;i<60;i++){Date.now.mock.mockImplementation(()=>start+(i>=30?60001:0));get(store);}
  repo.close();repo=createRepository(join(dir,'test.sqlite'));store=createChatSessionStore({repository:repo,now:()=>Date.now()});
  Date.now.mock.mockImplementation(()=>start+120002);
  assert.throws(()=>get(store),e=>e.code==='SESSION_CREATION_LIMIT');
 }finally{repo.close();rmSync(dir,{recursive:true,force:true});}
});
