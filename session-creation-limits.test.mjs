import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRepository} from './storage.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {createApp} from './app.mjs';

function create(store,ip='test',cookie='') {
  return store({headers:{cookie},ip,secure:false},{cookie(){},set(){}});
}
test('fresh or invalid cookies cannot allocate more than thirty sessions per IP per minute',()=>{
  const repo=createRepository();
  try {
    const get=createChatSessionStore({repository:repo});
    for(let i=0;i<30;i++)create(get,'same-ip',i%2?'caro_session=invalid':'');
    assert.throws(()=>create(get,'same-ip'),e=>e.status===429&&e.code==='SESSION_CREATION_LIMIT');
    assert.equal(repo.sessionCount(),30);
    create(get,'other-ip');
    assert.equal(repo.sessionCount(),31);
  } finally {repo.close();}
});
test('global creation budget covers different IPs and store instances',()=>{
  const repo=createRepository();
  try {
    const get=createChatSessionStore({repository:repo});
    for(let i=0;i<120;i++)create(get,'ip-'+i);
    const another=createChatSessionStore({repository:repo});
    assert.throws(()=>create(another,'different-ip'),e=>e.status===429);
    assert.equal(repo.sessionCount(),120);
  } finally {repo.close();}
});
test('existing sessions still open when creation budget is exhausted',()=>{
  const repo=createRepository();
  try {
    const get=createChatSessionStore({repository:repo});
    const first=create(get);
    for(let i=1;i<30;i++)create(get);
    assert.throws(()=>create(get),e=>e.status===429);
    for(let i=0;i<50;i++)assert.equal(create(get,'test',`caro_session=${first.id}`).id,first.id);
    assert.equal(repo.sessionCount(),30);
  } finally {repo.close();}
});
test('creation quota survives database restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'caro-creation-'));
  let repo=createRepository(join(dir,'test.sqlite'));
  try {
    let get=createChatSessionStore({repository:repo});
    for(let i=0;i<30;i++)create(get);
    repo.close(); repo=createRepository(join(dir,'test.sqlite'));
    get=createChatSessionStore({repository:repo});
    assert.throws(()=>create(get),e=>e.status===429);
    assert.equal(repo.sessionCount(),30);
  } finally {repo.close();rmSync(dir,{recursive:true,force:true});}
});
test('new session can be allocated at the creation quota window boundary',t=>{
  const repo=createRepository();
  t.mock.method(Date,'now',()=>2_000_000);
  try {
    const get=createChatSessionStore({repository:repo,now:()=>Date.now()});
    for(let i=0;i<30;i++)create(get);
    assert.throws(()=>create(get),e=>e.status===429);
    Date.now.mock.mockImplementation(()=>2_060_000);
    create(get);
    assert.equal(repo.sessionCount(),31);
  } finally {repo.close();}
});
test('HTTP session and chat routes reject creation before saving a session or invoking AI',async()=>{
  const repo=createRepository();
  const get=createChatSessionStore({repository:repo});
  let calls=0;
  const app=createApp({sessionOptions:{getSession:get},chatOptions:{getSession:get,replyToMessage:async()=>{calls++;return {kind:'unavailable'};}}});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(let i=0;i<30;i++)assert.equal((await fetch(base+'/api/session')).status,200);
    for(const path of ['/api/session','/api/session/reset','/api/chat']) {
      const response=await fetch(base+path,path==='/api/session'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'test'})});
      assert.equal(response.status,429);
    }
    assert.equal(repo.sessionCount(),30);
    assert.equal(calls,0);
  } finally {await new Promise(resolve=>server.close(resolve));repo.close();}
});
