import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatSessionStore} from './chat-session.mjs';

function harness() {
  const rows=new Map(), locks=new Map();
  let failRead=false, saveCalls=0, unlockCalls=0;
  const failure=new Error('simulated database read failure');
  const repository={
    load(id){if(failRead)throw failure;return rows.get(id)??null;},
    save(session){saveCalls++; rows.set(session.id,structuredClone(session));},
    cleanup(){}, sessionCount(){return rows.size;}, allow(){return true;}, allowMany(){return true;},
    lock(id,owner){if(locks.has(id))return false;locks.set(id,owner);return true;},
    unlock(id,owner){unlockCalls++;if(locks.get(id)===owner)locks.delete(id);},
  };
  const get=createChatSessionStore({repository});
  const session=get({headers:{},secure:false},{cookie(){},set(){}});
  return {session,locks,failure,repository,setFail(value){failRead=value;},get saveCalls(){return saveCalls;},get unlockCalls(){return unlockCalls;}};
}

test('failed read after lock releases it immediately and preserves the error',()=>{
  const h=harness(); h.setFail(true);
  assert.throws(()=>h.session.acquire(),error=>error===h.failure);
  assert.equal(h.locks.size,0);
  assert.equal(h.session.busy,false);
  assert.equal(h.unlockCalls,1);
  assert.equal(h.saveCalls,1,'failed acquisition must not persist stale state');
  h.setFail(false);
  assert.equal(h.session.acquire(),true,'retry works immediately, without lease timeout');
  h.session.release();
  assert.equal(h.locks.size,0);
});

test('another request can acquire the session immediately after failed acquisition',()=>{
  const h=harness(); h.setFail(true);
  assert.throws(()=>h.session.acquire(),h.failure);
  h.setFail(false);
  const second=createChatSessionStore({repository:h.repository})({headers:{cookie:`caro_session=${h.session.id}`},secure:false},{cookie(){},set(){}});
  assert.equal(second.acquire(),true);
  assert.equal(h.session.acquire(),false,'failed owner cannot take a lock held by the new owner');
  assert.equal(h.unlockCalls,1,'failed lock acquisition must not unlock another owner');
  second.release();
  assert.equal(h.locks.size,0);
});

test('successful acquisition still holds its lock until release',()=>{
  const h=harness();
  assert.equal(h.session.acquire(),true);
  assert.equal(h.session.busy,true);
  assert.equal(h.locks.size,1);
  assert.equal(h.session.acquire(),false);
  assert.equal(h.unlockCalls,0);
  h.session.release();
  assert.equal(h.session.busy,false);
  assert.equal(h.locks.size,0);
});
