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
  const current = { innerHTML: '<p>새 서</p>' };
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
  assert.equal(current.innerHTML, '<p class="scene-headline">결과</p><p>새 서사</p><p>다음 문단</p>');
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
    createSceneStoryBlock() { return { appendChild() {} }; },
    async typeParagraph() { client.sceneRenderToken = 2; client.activeAnimatedStory = newer; return false; },
  });
  await ctx.animateStoryText({ paragraphs: ['이전 실행'] }, 1);
  assert.equal(client.activeAnimatedStory, newer);
  assert.equal(client.isSceneTyping, true);
});
