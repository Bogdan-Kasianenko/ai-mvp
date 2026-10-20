import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {EventEmitter} from 'node:events';
import {createRepository} from './storage.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {createChatHandler} from './chat-route.mjs';
const rule=(bucket,limit=1,windowMs=60000)=>({bucket,limit,windowMs});
function response(){return Object.assign(new EventEmitter(),{locals:{},cookie(){},set(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});}

test('a later rejected quota does not charge earlier buckets',()=>{
 const repo=createRepository();
 try{
  assert.equal(repo.allow('hour',1,3600000),true);
  assert.equal(repo.allowMany([rule('ip'),rule('global'),rule('hour',1,3600000)]),false);
  assert.equal(repo.allow('ip',1,60000),true);
  assert.equal(repo.allow('global',1,60000),true);
 }finally{repo.close();}
});
test('global rejection does not consume a visitor quota',()=>{
 const repo=createRepository();
 try{
  assert.equal(repo.allow('global',1,60000),true);
  assert.equal(repo.allowMany([rule('visitor'),rule('global')]),false);
  assert.equal(repo.allow('visitor',1,60000),true);
 }finally{repo.close();}
});
test('a successful check charges every bucket exactly once',()=>{
 const repo=createRepository();
 try{
  const limits=[rule('ip',2),rule('global',2)];
  assert.equal(repo.allowMany(limits),true);assert.equal(repo.allowMany(limits),true);
  assert.equal(repo.allowMany(limits),false);
  assert.equal(repo.allow('ip',3,60000),true);assert.equal(repo.allow('global',3,60000),true);
 }finally{repo.close();}
});
test('multiple windows for one bucket record one accepted request',()=>{
 const repo=createRepository();
 try{
  const limits=[rule('shared',2),rule('shared',2,3600000)];
  assert.equal(repo.allowMany(limits),true);assert.equal(repo.allowMany(limits),true);assert.equal(repo.allowMany(limits),false);
 }finally{repo.close();}
});
test('window boundaries retain the longer quota without charging the shorter one on rejection',t=>{
 let now=2_000_000;t.mock.method(Date,'now',()=>now);
 const repo=createRepository();
 try{
  const limits=[rule('minute',1),rule('hour',2,3600000)];
  assert.equal(repo.allowMany(limits),true);
  now+=60000;assert.equal(repo.allowMany(limits),true);
  now+=60000;assert.equal(repo.allowMany(limits),false);
  assert.equal(repo.allow('minute',1,60000),true);
 }finally{repo.close();}
});
test('an insertion failure rolls back every quota charge',()=>{
 const dir=mkdtempSync(join(tmpdir(),'caro-atomic-'));const path=join(dir,'test.sqlite');
 const repo=createRepository(path);const db=new DatabaseSync(path);
 try{
  db.exec("CREATE TRIGGER fail_second_quota BEFORE INSERT ON attempts WHEN NEW.bucket='second' BEGIN SELECT RAISE(ABORT,'quota test failure'); END;");
  assert.throws(()=>repo.allowMany([rule('first'),rule('second')]),/quota test failure/);
  assert.equal(repo.allow('first',1,60000),true);
 }finally{db.close();repo.close();rmSync(dir,{recursive:true,force:true});}
});
test('grouped quota charges are shared across connections and survive reopening',()=>{
 const dir=mkdtempSync(join(tmpdir(),'caro-atomic-shared-'));const path=join(dir,'test.sqlite');
 let first=createRepository(path);const second=createRepository(path);
 try{
  assert.equal(first.allowMany([rule('ip-one'),rule('global')]),true);
  assert.equal(second.allowMany([rule('ip-two'),rule('global')]),false);
  assert.equal(second.allow('ip-two',1,60000),true);
  first.close();first=createRepository(path);
  assert.equal(first.allow('global',1,60000),false);
 }finally{first.close();second.close();rmSync(dir,{recursive:true,force:true});}
});

for(const [name,suffix,limit,windowMs] of [['hour','hour',60,3600000],['day','day',200,86400000]])test('sources over the '+name+' quota cannot exhaust new visitors global session budget',()=>{
 const repo=createRepository();
 try{
  const store=createChatSessionStore({repository:repo});
  for(let source=0;source<4;source++){
   const ip='blocked-'+source;
   for(let n=0;n<limit;n++)assert.equal(repo.allow('session-create-ip-'+suffix+':'+ip,limit,windowMs),true);
   for(let n=0;n<30;n++)assert.throws(()=>store({headers:{},ip},response()),error=>error.code==='SESSION_CREATION_LIMIT');
  }
  assert.equal(repo.sessionCount(),0);
  const visitor=store({headers:{},ip:'fresh-visitor'},response());
  assert.ok(visitor.id);assert.equal(repo.sessionCount(),1);
 }finally{repo.close();}
});
test('chat global rejection leaves a visitor quota untouched and never invokes the model',async()=>{
 const repo=createRepository();let calls=0;
 try{
  const store=createChatSessionStore({repository:repo});
  const session=store({headers:{},ip:'visitor'},response());
  for(let n=0;n<120;n++)assert.equal(repo.allow('chat-global',120,60000),true);
  const company=JSON.parse(readFileSync(new URL('./company.json',import.meta.url),'utf8'));
  const handler=createChatHandler({getSession:store,loadCompanyData:async()=>company,replyToMessage:async()=>{calls++;return{kind:'unavailable'};},sendConfirmation:()=>{throw Error('No mail expected');}});
  const out=response();await handler({headers:{cookie:'caro_session='+session.id},ip:'visitor',body:{message:'Dotaz'}},out);
  assert.equal(out.code,429);assert.equal(calls,0);
  assert.equal(repo.allow('chat-ip:visitor',1,60000),true);
 }finally{repo.close();}
});
