import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {APIConnectionTimeoutError} from 'openai';
import {createApp} from './app.mjs';
import {createChatSessionStore} from './chat-session.mjs';
import {messages,clientMessages} from './messages.mjs';

const languages=['cs','sk','en','ru','uk','de'];
test('all supported languages have complete server and browser messages',()=>{
  const expected=Object.keys(messages('en')).sort();
  for(const language of languages) {
    const t=messages(language);
    assert.deepEqual(Object.keys(t).sort(),expected);
    for(const [key,value] of Object.entries(t)) {
      if(Array.isArray(value)) assert.ok(value.every(x=>typeof x==='string'&&x.trim()));
      else assert.ok(typeof value==='string'&&value.trim(),language+': '+key);
    }
    assert.equal(t.labels.length,10);assert.equal(t.parts.length,3);
    if(language!=='en') {
      for(const key of ['busy','limit','unavailable','refusal','timeout','requestFailed','connectionFailed']) assert.notEqual(t[key],messages('en')[key],language+': English fallback in '+key);
    }
    assert.deepEqual(Object.keys(clientMessages(language)).sort(),Object.keys(clientMessages('en')).sort());
  }
});

test('HTTP errors, restoration and browser fallback messages follow the conversation language',async t=>{
  t.mock.method(console,'error',()=>{});
  const store=createChatSessionStore();
  const app=createApp({
    chatOptions:{getSession:store,replyToMessage:async(message,_company,_history,intake)=>{
      if(message==='simulate-rate') throw Object.assign(new Error('test'),{status:429,code:'test_rate'});
      if(message==='simulate-timeout') throw new APIConnectionTimeoutError();
      if(message==='simulate-failure') throw new Error('test');
      if(message==='simulate-unavailable') return {kind:'unavailable'};
      return {kind:'reply',text:'Test reply',intake,language:message,submissionAction:'none'};
    }},sessionOptions:{getSession:store}
  });
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;let cookie;
  async function call(path,{body,raw,headers={}}={}) {
    const response=await fetch(url+path,{
      method:body!==undefined||raw!==undefined?'POST':'GET',
      headers:{...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},
      ...(raw!==undefined?{body:raw}:body!==undefined?{body:JSON.stringify(body)}:{})
    });
    cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;
    return {code:response.status,data:await response.json()};
  }
  try {
    for(const language of languages) {
      const m=messages(language);
      const first=await call('/api/chat',{body:{message:language}});
      assert.equal(first.code,200);assert.equal(first.data.language,language);assert.deepEqual(first.data.clientMessages,clientMessages(language));
      const restored=await call('/api/session');
      assert.equal(restored.data.language,language);assert.equal(restored.data.clientMessages.timeout,m.timeout);
      const cases=[
        [{body:{message:''}},400,'invalidMessage'],
        [{body:{message:'test',confirmationToken:'bad'}},400,'invalidConfirmation'],
        [{body:{message:'test',messageId:'not a valid id'}},400,'invalidMessageId'],
        [{body:{message:'test',conversationId:'old'}},409,'staleConversation'],
        [{raw:'{'},400,'invalidJson'],
        [{raw:'x'.repeat(66000)},413,'bodyTooLarge'],
        [{raw:'{}',headers:{'Content-Type':'application/json; charset=iso-8859-1'}},415,'unsupportedEncoding'],
        [{body:{message:'test'},headers:{Origin:'https://unrelated.example'}},403,'crossOrigin'],
        [{body:{message:'simulate-rate'}},503,'unavailable'],
        [{body:{message:'simulate-timeout'}},503,'timeout'],
        [{body:{message:'simulate-failure'}},500,'requestFailed'],
        [{body:{message:'simulate-unavailable'}},502,'unavailable'],
      ];
      for(const [request,code,key] of cases) {
        const result=await call('/api/chat',request);
        assert.equal(result.code,code,language+': '+key);
        assert.equal(result.data.error,m[key],language+': '+key);
      }
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
