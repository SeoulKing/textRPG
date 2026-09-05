const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-api.js'), 'utf8');
function loadFunctions(names, globals = {}) {
  const snippets = names.map(name => {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.notEqual(start, -1, `Missing ${name}`);
    const rest = source.slice(start);
    const end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  });
  const context = vm.createContext(globals);
  vm.runInContext(snippets.join('\n'), context);
  return context;
}

const decision = loadFunctions([
  'currentSceneId', 'isEventStoryActive', 'storySurfaceId',
  'splitSummaryToParagraphs', 'buildStoryDisplay', 'shouldContinueLocationStory',
]);
function snapshot(location = 'convenience', scene = 'overview', paragraphs = ['장소의 서사']) {
  return { gameId: 'test-game', state: { location }, currentScene: { id: scene, paragraphs } };
}

test('moving to an object, collecting, and stepping back continue the same location', () => {
  const overview = snapshot();
  const object = snapshot('convenience', 'crate', ['보관함 앞의 서사']);
  const collected = snapshot('convenience', 'crate-empty', ['보관함을 비웠다']);
  assert.equal(decision.shouldContinueLocationStory(overview, object), true);
  assert.equal(decision.shouldContinueLocationStory(object, collected), true);
  assert.equal(decision.shouldContinueLocationStory(collected, overview), true);
});

test('new locations, new games, and subway scenes do not inherit location history', () => {
  const previous = snapshot();
  assert.equal(decision.shouldContinueLocationStory(previous, snapshot('shelter')), false);
  assert.equal(decision.shouldContinueLocationStory(previous, { ...snapshot(), gameId: 'other-game' }), false);
  assert.equal(decision.shouldContinueLocationStory(null, previous), false);
  const subway = snapshot();
  subway.state.subwayExpedition = { active: true };
  assert.equal(decision.shouldContinueLocationStory(previous, subway), false);
  assert.equal(decision.shouldContinueLocationStory(subway, previous), false);
});

test('unchanged snapshots do not duplicate prose, but changed prose and events continue', () => {
  const previous = snapshot();
  assert.equal(decision.shouldContinueLocationStory(previous, structuredClone(previous)), false);
  assert.equal(decision.shouldContinueLocationStory(previous, snapshot('convenience', 'overview', ['새 반응'])), true);
  const event = { ...snapshot(), latestEvent: { id: 'encounter', title: '인기척', summary: '누군가 다가온다.', choices: [{}] } };
  assert.equal(decision.shouldContinueLocationStory(previous, event), true);
});

test('skipping typing replaces only the partial current block, without duplicating history', () => {
  const history = { innerHTML: '<p>이전 서사</p>' };
  const currentProse = { innerHTML: '<p>새 서</p>' };
  const note = { hidden: true };
  const current = { children: [currentProse, note], querySelector(selector) { assert.equal(selector, '.scene-prose'); return currentProse; } };
  let revealed = 0, aligned = 0;
  const client = {
    isSceneTyping: true,
    activeAnimatedStory: { headline: '결과', paragraphs: ['새 서사', '다음 문단'] },
    activeAnimatedSystemNote: null,
    activeStoryAnimationOptions: { append: true, block: current, revealChoices: true, scrollToStart: true },
  };
  const dom = { sceneText: { children: [history, current] }, choices: { classList: { remove() {}, add() {} }, offsetWidth: 100 } };
  const ctx = loadFunctions(['skipSceneTyping', 'escapeHtml'], {
    client, dom,
    clearSceneAnimation() { client.isSceneTyping = false; client.activeStoryAnimationOptions = null; },
    renderChoices() { revealed++; },
    scrollSceneStoryToStart(block) { assert.equal(block, current); aligned++; },
  });
  assert.equal(ctx.skipSceneTyping(), true);
  assert.equal(history.innerHTML, '<p>이전 서사</p>');
  assert.equal(current.children[1], note);
  assert.equal(currentProse.innerHTML, '<p class="scene-headline">결과</p><p>새 서사</p><p>다음 문단</p>');
  assert.equal(dom.sceneText.children.length, 2);
  assert.equal(revealed, 1);
  assert.equal(aligned, 1);
  assert.equal(ctx.skipSceneTyping(), false);
});

test('scrolling aligns the new first line below the mobile status bar and respects reduced motion', () => {
  const callbacks = [], scrolls = [];
  let reduced = false;
  const block = { isConnected: true, getBoundingClientRect: () => ({ top: 350 }) };
  const dom = {
    sceneText: { lastElementChild: block },
    appShell: { scrollTop: 100, getBoundingClientRect: () => ({ top: 44 }), scrollTo(value) { scrolls.push(value); } },
  };
  const ctx = loadFunctions(['scrollSceneStoryToStart'], {
    dom,
    window: {
      requestAnimationFrame(fn) { callbacks.push(fn); },
      matchMedia(query) { return { matches: query.includes('reduced-motion') ? reduced : true }; },
    },
  });
  ctx.scrollSceneStoryToStart(block); callbacks.shift()();
  assert.equal(scrolls[0].top, 394);
  assert.equal(scrolls[0].behavior, 'smooth');
  reduced = true;
  ctx.scrollSceneStoryToStart(block); callbacks.shift()();
  assert.equal(scrolls[1].behavior, 'instant');
  ctx.scrollSceneStoryToStart(block);
  dom.sceneText.lastElementChild = {};
  callbacks.shift()();
  assert.equal(scrolls.length, 2);
});

test('a cancelled typing run cannot clear a newer active narrative', async () => {
  const newer = { paragraphs: ['새 실행'] };
  const client = { sceneRenderToken: 1 };
  const ctx = loadFunctions(['animateStoryText'], {
    client,
    dom: { sceneFrame: { classList: { add() {}, remove() {} } }, choices: { innerHTML: '', classList: { remove() {} } } },
    document: { createElement() { return {}; } },
    createSceneStoryBlock() { return { querySelector() { return { appendChild() {} }; } }; },
    async typeParagraph() { client.sceneRenderToken = 2; client.activeAnimatedStory = newer; return false; },
  });
  await ctx.animateStoryText({ paragraphs: ['이전 실행'] }, 1);
  assert.equal(client.activeAnimatedStory, newer);
  assert.equal(client.isSceneTyping, true);
});


function noteHistoryFixture() {
  function element() {
    return {
      children: [], hidden: false, innerHTML: '', attributes: {},
      classList: { remove() {}, add() {}, toggle() {} },
      get childElementCount() { return this.children.length; },
      appendChild(child) { child.parentElement = this; this.children.push(child); },
      replaceChildren() { this.children.forEach(child => child.parentElement = null); this.children = []; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; if (name === 'id') this.id = ''; },
    };
  }
  const dom = { sceneText: element(), systemNote: element() };
  const client = { renderedSystemNote: '', renderedSystemNoteKey: '' };
  const ctx = loadFunctions([
    'createSceneStoryBlock', 'createSceneSystemNote', 'renderSystemNote',
    'structuredSystemNoteToken', 'isElapsedTimeSystemNoteToken', 'escapeHtml',
  ], { client, dom, document: { createElement: element } });
  return { ctx, dom, client };
}

test('each narrative keeps its note through an empty typing block and later results', () => {
  const { ctx, dom } = noteHistoryFixture();
  const first = ctx.createSceneStoryBlock(false);
  ctx.renderSystemNote('+2 눅눅한 빵', 'reward-1');
  const firstNote = dom.systemNote, firstHtml = firstNote.innerHTML;

  const intermediate = ctx.createSceneStoryBlock(true);
  assert.equal(first.children[0].children[1], firstNote);
  assert.equal(firstNote.hidden, false);
  assert.equal(firstNote.innerHTML, firstHtml);
  assert.equal(firstNote.id, '');
  assert.equal(firstNote.attributes.role, undefined);
  assert.equal(intermediate.children[0].children[1].hidden, true);

  const next = ctx.createSceneStoryBlock(true);
  ctx.renderSystemNote('+2 눅눅한 빵', 'reward-1');
  assert.equal(dom.systemNote.hidden, true, 'a carried result must not be copied to the new block');
  ctx.renderSystemNote('+2 눅눅한 빵', 'reward-2');
  assert.notEqual(dom.systemNote, firstNote);
  assert.equal(dom.systemNote.parentElement, next.children[0]);
  assert.equal(dom.systemNote.hidden, false);
  assert.equal(firstNote.innerHTML, firstHtml);
  assert.equal(dom.sceneText.childElementCount, 3);
});

test('new results on unchanged prose accumulate once and a new location clears the history', () => {
  const { ctx, dom } = noteHistoryFixture();
  const block = ctx.createSceneStoryBlock(false);
  ctx.renderSystemNote('+1 목재', 'result-1');
  const firstNote = dom.systemNote;
  ctx.renderSystemNote('-1 체력', 'result-2');
  const secondNote = dom.systemNote;
  assert.equal(block.children[0].children.length, 3);
  assert.equal(firstNote.hidden, false);
  assert.match(firstNote.innerHTML, /is-positive/);
  assert.match(secondNote.innerHTML, /is-negative/);

  ctx.renderSystemNote('-1 체력', 'result-2');
  ctx.renderSystemNote('');
  assert.equal(block.children[0].children.length, 3);
  assert.equal(secondNote.hidden, false);
  assert.equal(secondNote.id, 'system-note');
  assert.equal(secondNote.attributes.role, 'status');

  const replacement = ctx.createSceneStoryBlock(false);
  ctx.renderSystemNote('-1 체력', 'result-2');
  assert.equal(dom.sceneText.children.length, 1);
  assert.equal(dom.sceneText.children[0], replacement);
  assert.equal(block.parentElement, null);
  assert.equal(dom.systemNote.hidden, false);
});


test('cash, items, stats, damage and travel share the same natural-height narrative content', () => {
  const { ctx, dom } = noteHistoryFixture();
  const block = ctx.createSceneStoryBlock(true);
  const content = block.children[0];
  assert.equal(content.className, 'scene-story-content');
  assert.equal(content.children[0].className, 'scene-prose');
  content.children[0].innerHTML = '<p>계산대 서랍에서 남은 지폐와 동전을 챙긴다.</p>';
  const notes = ['+1,500원 / +5분', '+2 캔 음식', '-1 체력', '나: 2 피해', '이동: 숲 / +15분'];
  notes.forEach((note, index) => {
    ctx.renderSystemNote(note, `result-${index}`);
    assert.equal(dom.systemNote.parentElement, content);
    assert.equal(content.children.at(-1), dom.systemNote);
    assert.equal(dom.systemNote.hidden, false);
  });
  assert.equal(block.children.length, 1, 'reading space must not sit between prose and results');
  assert.equal(content.children.length, notes.length + 1);
});
