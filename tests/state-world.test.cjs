const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createWorld, enterWorld, execute, viewWorld, restoreWorld, snapshotWorld, serializeWorld } = require('../.server-dist/game/state-world');
const { observe } = require('../.server-dist/game/state-world/observe');
const { render } = require('../.server-dist/game/state-world/render');
const { choices } = require('../.server-dist/game/state-world/choices');
const { StateWorldService } = require('../.server-dist/game/state-world/service');
const { normalizeGameSession, FileGameRepository } = require('../.server-dist/game/repository');
const { GAME_MINUTE_MS } = require('../.server-dist/game/base-data');
const { registerStateWorldRoutes } = require('../.server-dist/state-world-routes');
const Fastify = require('fastify');
const initial = () => { const world = createWorld(); enterWorld(world); return world; };
function choose(world, id) {
  const choice = choices(world, observe(world)).find(c => c.id === id);
  assert(choice, 'Missing choice: ' + id);
  execute(world, choice.command, choice.revision);
}
function unlock(world) {
  choose(world, 'approach:cabinet_01'); choose(world, 'open:cabinet_01');
  choose(world, 'move:hall'); choose(world, 'take:key_01'); choose(world, 'move:entry');
  choose(world, 'approach:cabinet_01'); choose(world, 'unlock:cabinet_01');
}
function sorted(value) {
  return Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
}
class MemoryRepository {
  saves = 0;
  sessions = new Map();
  async withGameLock(id, operation) { return operation(); }
  async saveGame(session) { this.saves++; this.sessions.set(session.id, sorted(JSON.parse(JSON.stringify(session)))); }
  async loadGame(id) { return normalizeGameSession(structuredClone(this.sessions.get(id))); }
}

test('entry shows structure, approach reveals contents automatically, same entity moves and stays gone on revisit', () => {
  let w = initial();
  assert.match(w.lastParagraphs.join(' '), /선반/); assert.match(w.lastParagraphs.join(' '), /닫혀/); assert.match(w.lastParagraphs.join(' '), /출구/);
  assert(!JSON.stringify(viewWorld(w)).includes('통조림'));
  const food = w.entities.get('food_01'); choose(w, 'approach:shelf_01');
  assert.match(w.lastParagraphs.join(' '), /통조림 두 개/);
  const position = w.player.nodeId; choose(w, 'look'); assert.equal(w.player.nodeId, position);
  choose(w, 'take:food_01'); assert.strictEqual(w.entities.get('food_01'), food);
  assert.equal(w.placements.get('food_01').parentId, 'inventory'); assert(!w.index.children.get('shelf_01').has('food_01'));
  assert.match(w.lastParagraphs.join(' '), /두 개를 챙겼/); assert.match(w.lastParagraphs.join(' '), /비어/);
  choose(w, 'defocus'); assert.equal(w.player.nodeId, position); choose(w, 'move:hall'); choose(w, 'move:entry');
  w = restoreWorld(JSON.parse(serializeWorld(w))); choose(w, 'approach:shelf_01');
  assert.match(w.lastParagraphs.join(' '), /비어/); assert.equal(viewWorld(w).inventory.find(i => i.targetId === 'food_01').quantity, 2);
});

test('locked attempt costs time; key, unlock, open, collect, close and reopen form a complete no-LLM flow', () => {
  const w = initial(); choose(w, 'approach:cabinet_01');
  assert(!JSON.stringify(viewWorld(w)).includes('medicine')); assert(!JSON.stringify(viewWorld(w)).includes('구급약'));
  const time = w.elapsedSeconds; choose(w, 'open:cabinet_01'); assert.equal(w.elapsedSeconds, time + 2);
  assert.match(w.lastParagraphs.join(' '), /잠겨/); assert.equal(w.entities.get('cabinet_01').open, false);
  choose(w, 'move:hall'); assert.match(w.lastParagraphs.join(' '), /열쇠/); choose(w, 'take:key_01');
  choose(w, 'move:entry'); choose(w, 'approach:cabinet_01'); choose(w, 'unlock:cabinet_01');
  assert(!JSON.stringify(viewWorld(w)).includes('구급약')); choose(w, 'open:cabinet_01');
  assert.match(w.lastParagraphs.join(' '), /구급약 한 개/); choose(w, 'take:medicine_01');
  assert.match(w.lastParagraphs.join(' '), /비어/); choose(w, 'close:cabinet_01');
  assert.match(w.lastParagraphs.join(' '), /내부를 볼 수 없/); choose(w, 'open:cabinet_01');
  assert.match(w.lastParagraphs.join(' '), /비어/); assert.equal(w.entities.get('medicine_01').quantity, 1);
});

test('invalid IDs, natural language, blocked routes, stale and duplicate takes leave every byte and time unchanged', () => {
  const w = initial();
  function rejected(raw, revision = w.revision) { const before = serializeWorld(w); assert.throws(() => execute(w, raw, revision)); assert.equal(serializeWorld(w), before); }
  rejected('선반으로 간다'); rejected({ type: 'take', targetId: 'missing' }); rejected({ type: 'take', targetId: 'medicine_01' });
  rejected({ type: 'take', targetId: 'food_01' }); rejected({ type: 'teleport', targetId: 'shelf_01' });
  const stale = w.revision; choose(w, 'approach:shelf_01'); rejected({ type: 'take', targetId: 'food_01' }, stale);
  choose(w, 'take:food_01'); rejected({ type: 'take', targetId: 'food_01' });
  w.edges.get('aisle_cabinet').blocked = true; rejected({ type: 'approach', targetId: 'cabinet_01' });
  w.edges.get('entry_hall').blocked = true; rejected({ type: 'move', targetId: 'hall' });
});

test('darkness, closed, occluded, partial and empty remain distinct; surfaces above closed containers stay visible', () => {
  const w = initial(); choose(w, 'approach:shelf_01');
  w.rooms.get('room_01').lit = false; choose(w, 'look'); assert.match(w.lastParagraphs.join(' '), /어두워/); assert(!w.lastParagraphs.join(' ').includes('비어'));
  assert(!choices(w, observe(w)).some(c => c.command.type === 'take'));
  w.rooms.get('room_01').lit = true; w.entities.get('food_01').concealed = true; choose(w, 'look');
  assert.match(w.lastParagraphs.join(' '), /가려져/); assert(!w.lastParagraphs.join(' ').includes('비어'));
  const save = snapshotWorld(w); save.entities.push({ id: 'extra', definitionId: 'food', quantity: 1, concealed: false });
  save.placements.push({ entityId: 'extra', parentId: 'shelf_01', relation: 'on' });
  const partial = restoreWorld(save); choose(partial, 'look'); assert.match(partial.lastParagraphs.join(' '), /전체 내용물은 확인하지 못/);
  const mixed = snapshotWorld(w); mixed.definitions.find(d => d.id === 'shelf').container = true; mixed.definitions.find(d => d.id === 'shelf').openable = true;
  Object.assign(mixed.entities.find(e => e.id === 'shelf_01'), { open: false, locked: false }); mixed.entities.find(e => e.id === 'food_01').concealed = false;
  const surface = restoreWorld(mixed); choose(surface, 'look'); assert.match(surface.lastParagraphs.join(' '), /통조림/); assert.match(surface.lastParagraphs.join(' '), /내부를 볼 수 없/);
});

test('unobserved timed changes preserve past memory, reads and focus changes do not advance the clock', () => {
  const w = initial(); unlock(w); choose(w, 'open:cabinet_01');
  const previous = structuredClone(w.memory.get('object:cabinet_01'));
  w.events.push({ id: 'close', type: 'close', targetId: 'cabinet_01', at: w.elapsedSeconds + 1 });
  choose(w, 'move:hall'); assert.equal(w.entities.get('cabinet_01').open, false);
  assert.deepEqual(w.memory.get('object:cabinet_01'), previous); assert(!w.lastParagraphs.join(' ').includes('캐비닛'));
  const time = w.elapsedSeconds; const save = serializeWorld(w); viewWorld(w); viewWorld(w, 1); assert.equal(serializeWorld(w), save);
  choose(w, 'look'); execute(w, {type:'defocus'}, w.revision); assert.equal(w.elapsedSeconds, time);
  assert(viewWorld(w).memory.every(m => m.text.startsWith('이전 확인 기록:')));
  const restored = restoreWorld(JSON.parse(serializeWorld(w))); assert.deepEqual(JSON.parse(serializeWorld(restored)), JSON.parse(serializeWorld(w)));
});

test('render and choices are pure; all offered actions execute from the same saved revision, including overflow pages', () => {
  const w = initial(); const save = snapshotWorld(w);
  for (let i = 0; i < 8; i++) {
    save.entities.push({ ...save.entities[0], id: 'shelf_extra_' + i, placementLabel: '벽 ' + i });
    save.placements.push({ entityId: 'shelf_extra_' + i, parentId: 'room_01', relation: 'in' });
  }
  const crowded = restoreWorld(save); const before = serializeWorld(crowded);
  render(observe(crowded), { type: 'look', seconds: 0 }, crowded.narrated); const catalogue = choices(crowded, observe(crowded));
  assert.equal(serializeWorld(crowded), before); assert.equal(new Set(catalogue.map(c => c.id)).size, catalogue.length);
  const pages = Array.from({ length: viewWorld(crowded).pageCount }, (_, page) => viewWorld(crowded, page).choices).flat();
  assert.deepEqual(pages.map(c => c.id), catalogue.map(c => c.id));
  for (const choice of catalogue) execute(restoreWorld(JSON.parse(before)), choice.command, choice.revision);
});

test('save integrity rejects duplicate parents, dangling IDs, cycles, negative stacks and unknown versions', () => {
  for (const mutate of [
    s => s.placements.push(s.placements[0]), s => s.placements[0].parentId = 'missing',
    s => { s.definitions[0].container = true; s.placements[0].parentId = 'shelf_01'; },
    s => s.entities[2].quantity = -1, s => s.version = 99,
    s => s.entities[0].definitionId = 'missing', s => s.edges[0].to = 'missing',
  ]) { const save = snapshotWorld(initial()); mutate(save); assert.throws(() => restoreWorld(save)); }
  const save = snapshotWorld(initial()); save.entities[2].quantity = 0; const empty = restoreWorld(save);
  choose(empty, 'approach:shelf_01'); assert.match(empty.lastParagraphs.join(' '), /비어/);
});

test('time events settle before rendering and restore never respawns corrupt saves', () => {
  const w = initial(); unlock(w);
  w.events.push({ id: 'close-immediately', type: 'close', targetId: 'cabinet_01', at: w.elapsedSeconds + 1 });
  choose(w, 'open:cabinet_01'); assert.equal(w.entities.get('cabinet_01').open, false);
  assert.match(w.lastParagraphs.join(' '), /닫혀/); assert(!w.lastParagraphs.join(' ').includes('구급약'));
  w.events.push({ id: 'lights-out', type: 'light', roomId: 'room_01', lit: false, at: w.elapsedSeconds + 1 });
  choose(w, 'open:cabinet_01'); assert.match(w.lastParagraphs.join(' '), /어두워/); assert(!w.lastParagraphs.join(' ').includes('구급약'));
});

test('service uses stored, JSONB-normalized choices, shared time, concurrent idempotency and zero network calls', async () => {
  const repo = new MemoryRepository(); const service = new StateWorldService(repo);
  const oldFetch = global.fetch; global.fetch = async () => { throw new Error('LLM/network forbidden'); };
  try {
    let view = await service.create(); const id = view.gameId;
    const act = async target => {
      const all = (await Promise.all(Array.from({length:view.pageCount}, (_,page) => service.get(id,page)))).flatMap(v => v.choices);
      const choice = all.find(c => c.id === target); assert(choice, target);
      view = await service.act(id, { requestId: randomUUID(), revision: choice.revision, command: choice.command }); return view;
    };
    await act('approach:shelf_01');
    const take = view.choices.find(c => c.id === 'take:food_01'); const request = { requestId:randomUUID(), revision:take.revision, command:take.command };
    const saves = repo.saves; const both = await Promise.all([service.act(id,request), service.act(id,request)]);
    assert.equal(repo.saves, saves + 1); assert(both.some(v => v.replayed)); view = both[0];
    await assert.rejects(service.act(id,{ ...request, command:{type:'look'} }), /다른 명령/);
    await assert.rejects(service.act(id,{ ...request, requestId:randomUUID() }), /상황이 바뀌/);
    const saved = await repo.loadGame(id); assert.equal(saved.state.inventory.food, undefined);
    assert.equal(saved.state.worldElapsedMs, Math.round(view.elapsedSeconds * GAME_MINUTE_MS / 60));
    const resumed = await new StateWorldService(repo).get(id); assert.deepEqual(resumed.inventory,view.inventory); assert.deepEqual(resumed.memory,view.memory);
    await act('approach:cabinet_01'); await act('open:cabinet_01'); await act('move:hall'); await act('take:key_01');
    await act('move:entry'); await act('approach:cabinet_01'); await act('unlock:cabinet_01'); await act('open:cabinet_01'); await act('take:medicine_01');
    assert.equal(view.inventory.length,3); assert.match(view.paragraphs.join(' '), /비어/);
    assert(Number.isFinite(view.timing.engineMs)); assert(view.timing.serverMs >= view.timing.engineMs);
  } finally { global.fetch = oldFetch; }
});

test('existing file repository round-trips world and memory', async () => {
  const fs = require('node:fs/promises'); const path = require('node:path');
  const root = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'state-world-'));
  try {
    const repo = new FileGameRepository(root); await repo.init(); const service = new StateWorldService(repo);
    let view = await service.create();
    const step = async id => { const c = view.choices.find(c=>c.id===id); assert(c,id); view=await service.act(view.gameId,{requestId:randomUUID(), revision:c.revision,command:c.command}); };
    await step('approach:shelf_01'); await step('take:food_01');
    const loaded = await new StateWorldService(new FileGameRepository(root)).get(view.gameId);
    const { timing, ...savedView } = view; assert.deepEqual(loaded, savedView);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('HTTP routes validate structured commands, preserve revision and do not expose authoritative contents', async () => {
  const repo = new MemoryRepository(); const app = Fastify(); registerStateWorldRoutes(app, repo);
  try {
    const created = await app.inject({method:'POST', url:'/api/state-world/games'}); assert.equal(created.statusCode,200);
    const view = created.json(); assert(!created.body.includes('medicine_01'));
    const before = repo.saves;
    const invalid = await app.inject({method:'POST',url:'/api/state-world/games/'+view.gameId+'/actions',payload:{requestId:randomUUID(),revision:0,command:{type:'take',targetId:'medicine_01'}}});
    assert.equal(invalid.statusCode,409); assert.equal(repo.saves,before);
    const read = await app.inject({method:'GET',url:'/api/state-world/games/'+view.gameId}); assert.deepEqual(read.json(),view);
    assert.equal((await app.inject('/api/state-world/games/'+view.gameId+'?page=NaN')).statusCode,400);
  } finally { await app.close(); }
});

test('a failed persistence transaction grants nothing and can safely retry the same request', async () => {
  const repo = new MemoryRepository(), service = new StateWorldService(repo);
  let view = await service.create();
  const approach = view.choices.find(c => c.id === 'approach:shelf_01');
  view = await service.act(view.gameId, {requestId: randomUUID(),revision: approach.revision,command: approach.command});
  const take = view.choices.find(c => c.id === 'take:food_01');
  const request = {requestId: randomUUID(),revision: take.revision,command: take.command};
  const before = JSON.stringify(repo.sessions.get(view.gameId));
  const save = repo.saveGame.bind(repo); repo.saveGame = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(service.act(view.gameId, request), /disk unavailable/);
  assert.equal(JSON.stringify(repo.sessions.get(view.gameId)), before);
  repo.saveGame = save;
  const next = await service.act(view.gameId, request); assert.equal(next.inventory[0].quantity, 2);
});

test('empty-but-occluded spaces are unknown and carried names never retain their former floor location', () => {
  const w = initial(); choose(w, 'approach:shelf_01'); choose(w, 'take:food_01');
  w.entities.get('shelf_01').contentsOccluded = true; choose(w, 'look');
  assert.match(w.lastParagraphs.join(' '), /가려져/); assert(!w.lastParagraphs.join(' ').includes('비어'));
  choose(w, 'move:hall'); choose(w, 'take:key_01');
  assert.equal(viewWorld(w).inventory.find(f => f.targetId === 'key_01').name, '작은 열쇠');
});

test('core action and choices use indexes without traversing whole-world entity or node collections', () => {
  const w = initial();
  for (const collection of [w.entities, w.rooms, w.nodes, w.edges]) collection.values = () => { throw new Error('global scan'); };
  choose(w, 'approach:shelf_01'); choose(w, 'take:food_01');
  assert.match(w.lastParagraphs.join(' '), /비어/);
});
