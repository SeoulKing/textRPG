const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app-api.js'), 'utf8');
const apiSource = source.slice(source.indexOf('function rateLimitError('), source.indexOf('function waitForMilliseconds('));
const syncSource = source.slice(source.indexOf('async function backgroundSync('), source.indexOf('async function bootstrap('));

function harness(fetch) {
  let now = Date.parse('2026-09-05T07:00:00Z');
  const client = { gameId:'test-game', snapshot:{}, isHomeVisible:false, apiRetryAt:0, syncRetryAt:0, syncFailures:0, syncInFlight:false };
  const context = vm.createContext({ client, fetch, document:{hidden:false}, console:{warn(){}},
    Date:class extends Date { static now() { return now; } }, renderStatusBar(){}, needsFreshGame(){return false;},
    storySurfaceId(){return 'same';}, shouldPreserveDisplayedScene(){return false;}, availableActionsSignature(){return '';},
    completedQuestChanges(){return [];}, showQuestCompletionBurst(){}, render(){} });
  vm.runInContext(apiSource + syncSource, context);
  return {client, context, advance(ms){now += ms;}, api:(...args)=>context.api(...args), sync:()=>context.backgroundSync()};
}
function limited(retryAfter) { return new Response('', {status:429,headers:retryAfter ? {'Retry-After':retryAfter} : {}}); }

test('429 pauses all requests until Retry-After, never replays a rejected action', async () => {
  let requests=0;
  const h=harness(async()=> ++requests === 1 ? limited('45') : Response.json({ok:true}));
  await assert.rejects(h.api('/actions',{method:'POST',body:{choiceId:'craft_firewood'}}), error=>error.status===429 && /45초/.test(error.message));
  await assert.rejects(h.api('/state'), error=>error.status===429);
  assert.equal(requests,1);
  h.advance(45000);
  assert.equal((await h.api('/state')).ok,true);
  assert.equal(requests,2);
});

test('Retry-After accepts HTTP dates and falls back when absent or malformed', async () => {
  for (const [header,seconds] of [['Sat, 05 Sep 2026 07:01:00 GMT',60],[null,30],['invalid',30]]) {
    const h=harness(async()=>limited(header));
    await assert.rejects(h.api('/state'),error=>error.status===429 && error.retryAt===Date.parse('2026-09-05T07:00:00Z')+seconds*1000);
  }
});

test('hidden tabs and overlapping polls do not send extra requests', async () => {
  let requests=0, release;
  const h=harness(()=>{ requests++; return new Promise(resolve=>release=resolve); });
  h.context.document.hidden=true;
  await h.sync(); assert.equal(requests,0);
  h.context.document.hidden=false;
  const first=h.sync(); await h.sync(); assert.equal(requests,1);
  release(Response.json({state:{}})); await first;
  assert.equal(h.client.syncInFlight,false);
});

test('failed polling backs off and resumes after the delay', async () => {
  let requests=0;
  const h=harness(async()=>{requests++;return new Response('',{status:500});});
  await h.sync(); await h.sync(); assert.equal(requests,1);
  h.advance(20000); await h.sync(); assert.equal(requests,2);
  h.advance(20000); await h.sync(); assert.equal(requests,2);
  h.advance(20000); await h.sync(); assert.equal(requests,3);
});

test('polling honors a server rate limit longer than its usual backoff', async () => {
  let requests=0;
  const h=harness(async()=>{requests++;return limited('120');});
  await h.sync(); h.advance(30000); await h.sync(); assert.equal(requests,1);
  h.advance(90000); await h.sync(); assert.equal(requests,2);
});

test('a poll finishing after an action cannot overwrite its result', async () => {
  let release;
  const h=harness(()=>new Promise(resolve=>release=resolve));
  const pending=h.sync();
  const newSnapshot={state:{sceneId:'cooking-result'}};
  h.client.snapshot=newSnapshot;
  release(Response.json({state:{sceneId:'old-menu'}})); await pending;
  assert.equal(h.client.snapshot,newSnapshot);
});
