const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const art = "https://game.test/assets/optimized/plaza-0123456789abcdef.webp";

function worker({ storageFails = false, status = 200 } = {}) {
  const events = {}, entries = new Map();
  let requests = 0;
  const cache = {
    match: async r => entries.get(typeof r === "string" ? r : r.url)?.clone(),
    put: async (r, response) => entries.set(r.url, response.clone()),
    keys: async () => [...entries.keys()].map(url => new Request(url)),
    delete: async r => entries.delete(r.url),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-worker.js"), "utf8"), {
    self: {location: {origin: "https://game.test"}, addEventListener: (name, fn) => events[name] = fn},
    URL, Request, Response, Headers, Promise,
    caches: {open: async () => {if (storageFails) throw Error("storage unavailable"); return cache;}},
    fetch: async () => {requests++; return new Response("image-data", {status});},
  });
  async function request(url = art, method = "GET") {
    let result; const waits = [];
    events.fetch({request: new Request(url, {method}), waitUntil: p => waits.push(p), respondWith: p => result = p});
    const response = await result;
    await Promise.all(waits);
    return response;
  }
  return {request, entries, get requests() {return requests;}};
}
test("repeat art uses device cache; APIs and mutable URLs never enter this cache", async () => {
  const w = worker();
  assert.equal(await (await w.request()).text(), "image-data");
  assert.equal(await (await w.request()).text(), "image-data");
  assert.equal(w.requests, 1);
  for (const [url, method] of [["https://game.test/api/games","POST"],["https://game.test/api/games/a/state","GET"],["https://game.test/assets/scenes/plaza.png","GET"],[art+"?v=changed","GET"],[art.replace("game.test","other.test"),"GET"]]) {
    assert.equal(await w.request(url, method), undefined);
  }
  assert.equal(w.requests, 1);
});
test("unavailable storage does not break downloads and errors are never cached", async () => {
  const blocked = worker({storageFails: true});
  assert.equal((await blocked.request()).status, 200);
  const failed = worker({status: 503});
  await failed.request(); await failed.request();
  assert.equal(failed.requests, 2); assert.equal(failed.entries.size, 0);
});
test("new hashes fetch new art and the persistent cache stays bounded", async () => {
  const w = worker();
  for (let i = 0; i < 83; i++) await w.request(art.replace("0123456789abcdef", i.toString(16).padStart(16, "0")));
  assert.equal(w.entries.size, 80);
  assert.equal(w.requests, 83);
});
function loader() {
  const events = {}, timers = new Map(), fetched = [];
  let next = 0;
  const context = vm.createContext({
    manifest: {"assets/a.png": "/assets/optimized/a-0123456789abcdef.webp", "assets/b.png": "/assets/optimized/b-0123456789abcdef.webp"},
    navigator: {}, document: {hidden:false, addEventListener:(k,fn)=>events[k]=fn}, window: {},
    AbortController, setTimeout: fn=>{timers.set(++next,fn);return next;}, clearTimeout: id=>timers.delete(id),
    fetch: async (url, options) => {fetched.push({url, options});return new Response("image");},
  });
  vm.runInContext(fs.readFileSync(path.join(root,"client/asset-loader.mjs"),"utf8").replace(/^import .*;\n/,"").replaceAll("export function ","function "), context);
  const tick = async () => {const entry=[...timers][0];if(entry){timers.delete(entry[0]);await entry[1]();}};
  return {context, fetched, tick};
}
test("background queue is ordered, deduplicated and pauses for foreground actions", async () => {
  const h=loader();
  h.context.queueAssets(["assets/a.png","assets/a.png","assets/b.png"]);
  h.context.pauseAssetWarmup(true); await h.tick(); assert.equal(h.fetched.length,0);
  h.context.pauseAssetWarmup(false); await h.tick(); await h.tick();
  assert.deepEqual(h.fetched.map(x=>x.url),["/assets/optimized/a-0123456789abcdef.webp","/assets/optimized/b-0123456789abcdef.webp"]);
  h.context.queueAssets(["assets/a.png"]);await h.tick();assert.equal(h.fetched.length,2);
});
test("region changes replace queued work; data-saver skips speculative downloads", async () => {
  const h=loader();
  h.context.queueAssets(["assets/a.png"]);
  h.context.queueAssets(["assets/b.png"],{replace:true});
  await h.tick();assert.equal(h.fetched[0].url,"/assets/optimized/b-0123456789abcdef.webp");
  h.context.navigator.connection={saveData:true};
  h.context.queueAssets(["assets/a.png"]);await h.tick();assert.equal(h.fetched.length,1);
  assert.equal(h.context.assetUrl("assets/a.png?v=new"),"assets/a.png?v=new");
});

test("both starting worlds keep complete map cards and current phase after startup optimization", async () => {
  const {GameService}=require("../.server-dist/game/service");
  const {buildRuntimeRegistry}=require("../.server-dist/game/runtime-registry");
  const {fallbackNarration}=require("../.server-dist/game/text-world/narrator");
  for (const startAt of ["shelter","arcana"]) {
    let saved;
    const repo={saveGame:async s=>{saved=structuredClone(s);},getTemplate:async()=>undefined,saveTemplate:async()=>{},appendGenerationLog:async()=>{}};
    const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c));
    const snapshot=await service.createGame(startAt);
    assert.equal(snapshot.state.location,startAt==="arcana"?"arcana_plaza":"shelter");
    const registry=buildRuntimeRegistry(saved.state);
    for (const location of Object.values(registry.locations)) {
      const card=saved.world.locationCards[location.id];
      assert.equal(card.name,location.name);
      assert.equal(card.imagePath,location.imagePath);
      assert.deepEqual(card.neighbors,location.neighbors);
      assert.deepEqual(card.availableActionIds,(location.interactionChoices||[]).map(c=>c.id));
    }
  }
});
