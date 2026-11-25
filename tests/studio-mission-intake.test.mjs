import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateBoard, selectTask } from '../scripts/studio/engine.mjs';
import { approvalDigest, assertGoalReady, assertTaskAuthorized } from '../scripts/studio/protocol.mjs';
import { createIntakeSchema, normalizeIntake } from '../scripts/studio/mission-intake.mjs';
import { derivePublicationIntent, verifyPublicationIntent } from '../scripts/studio/publication-intent.mjs';
import { resolveExecution } from '../scripts/studio/model-policy.mjs';

// 실행은 사용자 요청 때만 수행합니다: node --test tests/studio-mission-intake.test.mjs
// 이 파일은 모델·서버·브라우저를 호출하거나 실제 제작 원장을 변경하지 않습니다.
function boardFixture() {
  const goal = {
    id: 'COOK', title: '요리 시스템', status: 'active', dependsOnGoals: [],
    scope: { read: ['src/cooking'], write: ['src/cooking'] },
    acceptance: ['요리 결과를 확인할 수 있습니다.'],
    approval: {
      status: 'approved', approvedBy: '기존 사용자', approvedAt: '2026-11-05T00:00:00.000Z',
      allowedCapabilities: ['static', 'code', 'content', 'ui'], allowedChecks: [], newArt: false, publish: false,
    },
  };
  goal.approval.digest = approvalDigest(goal);
  return {
    version: 1, project: 'arcana',
    settings: { maxConcurrentAgents: 4, defaultMinutes: 90, maxReviewPasses: 2 },
    goals: [goal], tasks: [], decisions: [], requests: [],
  };
}

function commandFixture(overrides = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555', actorUserId: 'owner-123', target: 'director',
    text: '마법학교 내부 이쁘게 채워 주세요.', createdAt: '2026-11-05T01:00:00.000Z', ...overrides,
  };
}

function taskFixture(localId = 'decorate', overrides = {}) {
  return {
    localId, title: '기존 가구로 학교 공간 꾸미기', organization: 'world',
    playerChange: '마법학교 내부에서 가구와 소품을 볼 수 있습니다.', dependsOn: [],
    scope: { read: ['src/school'], write: ['src/school/interior.mjs'] },
    capabilities: ['content', 'ui'], checks: [], acceptance: ['이동 경로를 보존하며 기존 소품을 배치합니다.'],
    surface: 'cli', ...overrides,
  };
}

function instructionFixture(overrides = {}) {
  return {
    reply: '학교 내부 개선을 새 목표로 정리하고 월드 부서가 기존 소품을 배치하겠습니다.',
    kind: 'instruction', mode: 'new_goal', existingGoalId: null,
    goal: {
      title: '마법학교 내부 꾸미기', summary: '기존 가구와 소품으로 학교 내부를 채웁니다.',
      scope: { read: ['src/school'], write: ['src/school'] },
      acceptance: ['학교 내부에 기존 소품이 배치되고 이동 동선이 유지됩니다.'],
    },
    tasks: [taskFixture()], ...overrides,
  };
}

test('시각 지시의 좁은 미술 위임, 본편 진입점, 시안 선행과 편집기 잠금을 유지합니다', () => {
  const scene = 'godot-arcana/scenes/town.tscn';
  const art = 'art-studies/town';
  const request = instructionFixture();
  request.goal.scope = { read: [scene], write: [art, scene] };
  request.goal.visualContract = { direction: '광장 분위기를 정리합니다.', mainEntry: scene, artScope: [art] };
  const make = (id, stage, organization, dependsOn, write, extra = {}) => taskFixture(id, { visualStage: stage, organization, dependsOn,
    scope: { read: [scene, art], write }, ...extra });
  request.tasks = [
    make('plan','direction','design',[],[]),
    make('concept','concept','world',['plan'],[art + '/study.png'], { capabilities: ['art'] }),
    make('model','asset','world',['plan','concept'],[art], { capabilities: ['art'], productionMethod: 'blender', surface: 'app' }),
    make('place','integration','world',['model'],[scene,art + '/placed.png'], { productionMethod: 'godot', surface: 'app' }),
    make('photo','final_capture','quality',['place'],[art + '/final.png']),
  ];
  const value = normalizeIntake(boardFixture(), request, commandFixture());
  assert.equal(value.goal.studioWorkflow, 'autonomous-v1');
  assert.equal(value.goal.approval.newArt, true);
  assert.deepEqual(value.goal.approval.allowedChecks, []);
  assert.equal(value.tasks[4].mainEntry, 'godot-arcana/project.godot');
  assert.equal(value.tasks[4].targetScene, scene);
  assert.deepEqual(value.tasks[2].resourceLocks, ['editor:blender']);
  assert.deepEqual(value.tasks[3].resourceLocks, ['editor:godot-arcana']);
  assert.equal(value.tasks[2].status,'ready');
  request.tasks[2].dependsOn = ['plan'];
  assert.throws(() => normalizeIntake(boardFixture(), request, commandFixture()), /시안/);
  request.tasks[2].dependsOn.push('concept');
  request.tasks[2].scope.write.push(scene);
  assert.throws(() => normalizeIntake(boardFixture(), request, commandFixture()), /위임된/);
});

test('신규 양식의 독립 지시와 기존 목표 명시 보완을 구분합니다', () => {
  const board = boardFixture();
  const request = instructionFixture({ mode: 'existing_goal', goal: null, existingGoalId: 'COOK', tasks: [
    taskFixture('menu', { visualStage: null, scope: { read: ['src/cooking'], write: ['src/cooking/menu.mjs'] } }),
  ] });
  const fresh = normalizeIntake(board, request, commandFixture({ text: '요리 메뉴를 정리해 주세요.' }));
  assert.equal(fresh.mode, 'new_goal');
  assert.equal(fresh.goal.studioWorkflow, 'autonomous-v1');
  const existing = normalizeIntake(board, request, commandFixture({ text: '기존 COOK 목표에 요리 메뉴를 추가해 주세요.' }));
  assert.equal(existing.goal.id, 'COOK');
  assert.equal(existing.goal.studioWorkflow, undefined);
});

test('총괄과 시각 검토가 서빙 목록의 입력 지원 및 추론 강도에 따라 배정됩니다', () => {
  const board = boardFixture(), goal = board.goals[0];
  goal.studioWorkflow = 'autonomous-v1';
  goal.visualContract = { direction: '시안 검토' };
  const task = { organization: 'world', goalId: goal.id, visualStage: 'asset', productionMethod: 'blender' };
  const entry = (model, inputModalities, efforts) => ({ model, inputModalities, supportedReasoningEfforts: efforts.map((reasoningEffort) => ({ reasoningEffort })) });
  const models = [entry('gpt-6.2-astra',['text','image'],['high','xhigh']),entry('gpt-6.1-terra',['text','image'],['high','ultra'])];
  assert.equal(resolveExecution(board, task, 'producer', { models }).reasoningEffort, 'ultra');
  assert.equal(resolveExecution(board, task, 'reviewer', { models }).reasoningEffort, 'xhigh');
  assert.equal(resolveExecution(board, null, 'director', { models, goalId: goal.id }).reasoningEffort, 'high');
  models[0].inputModalities = ['text'];
  assert.equal(resolveExecution(board, task, 'reviewer', { models }).model, 'gpt-6.1-terra');
  assert.throws(() => resolveExecution(board, task, 'reviewer', { models: models.slice(0,1) }), /지원/);
  delete goal.visualContract;
  assert.equal(resolveExecution(board, null, 'director', { models: models.slice(1), goalId: goal.id }).model, 'gpt-6.1-terra');
  assert.equal(resolveExecution(board, { goalId: goal.id, organization: 'design' }, 'producer').profile, 'standard');
});

function appendIntake(board, intake) {
  const candidate = structuredClone(board);
  if (!candidate.goals.some((goal) => goal.id === intake.goal.id)) candidate.goals.push(structuredClone(intake.goal));
  candidate.tasks.push(...structuredClone(intake.tasks));
  candidate.decisions.push(...structuredClone(intake.decisions));
  return validateBoard(candidate);
}

test('다른 목표가 실행 중이어도 직접 지시를 별도 승인 목표로 만들고 원본을 보존합니다.', () => {
  const board = boardFixture();
  const result = instructionFixture();
  const command = commandFixture();
  const before = structuredClone({ board, result, command });
  const intake = normalizeIntake(board, result, command);

  assert.notEqual(intake.goal.id, 'COOK');
  assert.equal(intake.goal.title, result.goal.title);
  assert.equal(intake.goal.approval.status, 'approved');
  assert.deepEqual(intake.goal.approval.allowedCapabilities, ['static', 'code', 'content', 'ui']);
  assert.deepEqual(intake.goal.approval.allowedChecks, []);
  assert.equal(intake.goal.approval.newArt, false);
  assert.equal(intake.goal.approval.publish, false);
  assert.equal(intake.goal.approval.digest, approvalDigest(intake.goal));
  assert.equal(intake.goal.sourceInstruction.actorUserId, command.actorUserId);
  assert.equal(intake.goal.sourceInstruction.text, command.text);
  assert.equal(intake.goal.sourceInstruction.commandId, command.id);
  assert.equal(intake.autoStart, true);
  assert.equal(intake.tasks[0].goalId, intake.goal.id);
  const candidate = appendIntake(board, intake);
  assertGoalReady(candidate, intake.goal);
  assertTaskAuthorized(candidate, intake.tasks[0]);
  assert.deepEqual({ board, result, command }, before);
});

test('질문·상태 조회는 목표·작업·승인을 만들지 않습니다.', () => {
  const result = {
    reply: '현재 요리 시스템 목표를 진행 중입니다.', kind: 'discussion', mode: 'none',
    goal: null, tasks: [], existingGoalId: null,
  };
  const intake = normalizeIntake(boardFixture(), result, commandFixture({ text: '지금 무슨 일을 하고 있나요?' }));
  assert.equal(intake.goal, null);
  assert.deepEqual(intake.tasks, []);
  assert.deepEqual(intake.decisions, []);
  assert.equal(intake.autoStart, false);
  assert.throws(() => normalizeIntake(boardFixture(), { ...result, tasks: [taskFixture()] }, commandFixture()));
});

test('복수 부서의 역순 별칭 의존성을 실제 작업 ID로 바꾸고 실행 순서를 지킵니다.', () => {
  const board = boardFixture();
  const intake = normalizeIntake(board, instructionFixture({ tasks: [
    taskFixture('review', { organization: 'quality', capabilities: ['static'], scope: { read: ['src/school'], write: [] }, dependsOn: ['integrate'] }),
    taskFixture('integrate', { organization: 'development', capabilities: ['code'], dependsOn: ['decorate'] }),
    taskFixture('decorate'),
  ] }), commandFixture());
  const [review, integrate, decorate] = intake.tasks;
  assert.deepEqual(review.dependsOn, [integrate.id]);
  assert.deepEqual(integrate.dependsOn, [decorate.id]);
  assert.deepEqual(decorate.dependsOn, []);
  assert.equal(selectTask(appendIntake(board, intake), intake.goal.id).id, decorate.id);
});

test('실제 기존 작업 ID 의존성은 보존합니다.', () => {
  const board = boardFixture();
  board.tasks.push({
    id: 'COOK-BASE', goalId: 'COOK', title: '기존 공용 연결', organization: 'development', status: 'ready',
    priority: 1, playerChange: '공용 기능이 연결됩니다.', dependsOn: [],
    scope: { read: ['src/cooking'], write: ['src/cooking'] }, capabilities: ['code'], checks: [],
    acceptance: ['기존 기능이 연결됩니다.'], runtime: {},
  });
  const intake = normalizeIntake(board, instructionFixture({ tasks: [taskFixture('decorate', { dependsOn: ['COOK-BASE'] })] }), commandFixture());
  assert.deepEqual(intake.tasks[0].dependsOn, ['COOK-BASE']);
  assert.equal(selectTask(appendIntake(board, intake), intake.goal.id), null);
});

for (const [name, tasks] of [
  ['없는 별칭', [taskFixture('decorate', { dependsOn: ['missing'] })]],
  ['중복 별칭', [taskFixture(), taskFixture()]],
  ['자기 의존', [taskFixture('decorate', { dependsOn: ['decorate'] })]],
  ['두 부서의 순환', [taskFixture('decorate', { dependsOn: ['integrate'] }), taskFixture('integrate', { dependsOn: ['decorate'] })]],
]) {
  test(`잘못된 의존 관계를 원장에 반영하기 전에 거부합니다: ${name}`, () => {
    const board = boardFixture();
    const before = structuredClone(board);
    assert.throws(() => normalizeIntake(board, instructionFixture({ tasks }), commandFixture()));
    assert.deepEqual(board, before);
  });
}

for (const [name, overrides, blockKind] of [
  ['새 미술', { capabilities: ['art'] }, 'permission'],
  ['테스트', { capabilities: ['test'], checks: ['node --test tests/school.test.mjs'] }, 'permission'],
  ['브라우저', { capabilities: ['browser'], checks: ['school browser scenario'] }, 'permission'],
  ['내보내기', { capabilities: ['export'], checks: ['school export'] }, 'permission'],
  ['게시', { capabilities: ['publish'] }, 'permission'],
  ['능력에 숨겨진 검사', { capabilities: ['code'], checks: ['npm run test'] }, 'permission'],
  ['검사 명령이 없는 실행', { capabilities: ['test'], checks: [] }, 'permission'],
  ['앱 인계', { surface: 'app' }, 'app-handoff'],
]) {
  test(`추가 범위가 필요한 작업만 보류하고 일반 작업을 계속합니다: ${name}`, () => {
    const board = boardFixture();
    const intake = normalizeIntake(board, instructionFixture({ tasks: [
      taskFixture('ordinary'), taskFixture('special', overrides),
      taskFixture('afterSpecial', { dependsOn: ['special'] }),
    ] }), commandFixture());
    assert.equal(intake.tasks[0].status, 'ready');
    assert.equal(intake.tasks[1].status, 'blocked');
    assert.equal(intake.tasks[1].runtime.blockKind, blockKind);
    assert.equal(intake.decisions.length, 1);
    assert.equal(intake.decisions[0].taskId, intake.tasks[1].id);
    assert.equal(intake.decisions[0].status, 'pending');
    assert.equal(intake.autoStart, true);
    const candidate = appendIntake(board, intake);
    assertGoalReady(candidate, intake.goal);
    assert.equal(selectTask(candidate, intake.goal.id).id, intake.tasks[0].id);
    candidate.tasks.find((task) => task.id === intake.tasks[0].id).status = 'blocked';
    assert.equal(selectTask(candidate, intake.goal.id), null);
  });
}

test('모든 작업이 특별 권한을 기다리면 자동 실행을 시작하지 않습니다.', () => {
  const intake = normalizeIntake(boardFixture(), instructionFixture({ tasks: [taskFixture('art', { capabilities: ['art'] })] }), commandFixture());
  assert.equal(intake.autoStart, false);
  assert.equal(intake.tasks[0].status, 'blocked');
});

test('원장 저장 후 같은 명령이 다시 들어와도 목표·작업을 중복 생성하지 않습니다.', () => {
  const command = commandFixture();
  const result = instructionFixture();
  const first = normalizeIntake(boardFixture(), result, command);
  const stored = appendIntake(boardFixture(), first);
  const again = normalizeIntake(stored, result, command);
  assert.equal(again.goal.id, first.goal.id);
  assert.deepEqual(again.tasks, []);
  assert.deepEqual(again.decisions, []);
  assert.equal(again.autoStart, false);
  assert.equal(stored.goals.filter((goal) => goal.sourceInstruction?.commandId === command.id).length, 1);
  for (const overrides of [{ actorUserId: 'another-user' }, { text: '같은 ID의 다른 지시' }]) {
    assert.throws(() => normalizeIntake(stored, result, { ...command, ...overrides }), /같은 명령 ID/);
  }
});

test('기존 목표에는 승인 범위 안의 작업만 추가할 수 있고 원래 계약을 바꾸지 않습니다.', () => {
  const board = boardFixture();
  const result = instructionFixture({ mode: 'existing_goal', goal: null, existingGoalId: 'COOK', tasks: [
    taskFixture('cooking', { organization: 'development', capabilities: ['code'], scope: { read: ['src/cooking'], write: ['src/cooking/menu.mjs'] } }),
  ] });
  const intake = normalizeIntake(board, result, commandFixture({ text: '요리 메뉴를 정리해 주세요.' }));
  assert.equal(intake.goal.id, 'COOK');
  assert.equal(intake.goal.approval.digest, board.goals[0].approval.digest);
  assert.equal(intake.autoStart, true);
  const command = commandFixture({ text: '요리 메뉴를 정리해 주세요.' });
  const again = normalizeIntake(appendIntake(board, intake), result, command);
  assert.equal(again.goal.id, 'COOK');
  assert.deepEqual(again.tasks, []);
  assert.equal(again.autoStart, false);
  assert.throws(() => normalizeIntake(appendIntake(board, intake), result, { ...command, actorUserId: 'another-user' }), /같은 명령 ID/);
  assert.throws(() => normalizeIntake(board, { ...result, tasks: [taskFixture()] }, commandFixture()), /수정 범위/);
  for (const change of ['pending', 'done', 'changed']) {
    const candidate = structuredClone(board);
    if (change === 'pending') candidate.goals[0].approval.status = 'pending';
    if (change === 'done') candidate.goals[0].status = 'done';
    if (change === 'changed') candidate.goals[0].scope.write.push('src/another-feature');
    assert.throws(() => normalizeIntake(candidate, result, commandFixture()));
  }
});

for (const unsafe of [
  '../outside', 'D:\\outside', '/outside', 'src/../outside', 'src/*', 'src',
  '.git/config', '.aws/credentials', '.codex/config.toml', '.env', 'src/.env.production',
  'node_modules/package', '.runtime/studio', 'docs/studio', 'docs/studio/board.json',
]) {
  test(`자동 승인 범위로 사용할 수 없는 경로를 거부합니다: ${unsafe}`, () => {
    const result = instructionFixture();
    result.goal.scope.write = [unsafe];
    result.tasks[0].scope.write = [unsafe];
    assert.throws(() => normalizeIntake(boardFixture(), result, commandFixture()));
  });
}

test('연결 자격 증명과 운영 상태를 읽기 범위에 넣을 수 없고 실행 기록만 참조할 수 있습니다.', () => {
  for (const unsafe of [
    '.runtime', '.runtime/studio', '.runtime/studio/bridge-secrets.json',
    '.runtime/studio/bridge-config.json', '.runtime/studio/bridge-state.json', '.runtime/studio/runs/../bridge-secrets.json',
  ]) {
    const result = instructionFixture();
    result.goal.scope.read = [unsafe];
    result.tasks[0].scope.read = [unsafe];
    assert.throws(() => normalizeIntake(boardFixture(), result, commandFixture()), undefined, unsafe);
  }
  const result = instructionFixture();
  result.goal.scope.read = ['.runtime/studio/runs/previous/review.json'];
  result.tasks[0].scope.read = [...result.goal.scope.read];
  assert.equal(normalizeIntake(boardFixture(), result, commandFixture()).autoStart, true);
});

test('모델이 승인자·권한·원장 메타데이터를 끼워 넣을 수 없습니다.', () => {
  for (const mutate of [
    (result) => { result.goal.approval = { status: 'approved', publish: true }; },
    (result) => { result.goal.sourceInstruction = { actorUserId: 'forged-user' }; },
    (result) => { result.tasks[0].status = 'done'; },
    (result) => { result.tasks[0].capabilities = ['shell']; },
  ]) {
    const result = instructionFixture();
    mutate(result);
    assert.throws(() => normalizeIntake(boardFixture(), result, commandFixture()));
  }
  for (const overrides of [{ actorUserId: '' }, { id: '../forged' }, { text: '' }]) {
    assert.throws(() => normalizeIntake(boardFixture(), instructionFixture(), commandFixture(overrides)));
  }
});

test('호출자가 변경한 응답 스키마가 다음 지시의 계약으로 남지 않습니다.', () => {
  const first = createIntakeSchema();
  first.properties.kind.enum.push('forged');
  first.required.length = 0;
  const next = createIntakeSchema();
  assert.deepEqual(next.properties.kind.enum, ['discussion', 'instruction']);
  assert.ok(next.required.includes('tasks'));
});

function publicationFixture() {
  const command = commandFixture({ id: 'publish-1', text: '웹푸시하라고' });
  const history = [{ role: 'user', commandId: 'context-1', actorUserId: command.actorUserId, text: '아르카나 제작실 사이트에 주간 사용량 표시가 없는데' }];
  command.publicationIntent = derivePublicationIntent(command, history);
  const result = instructionFixture({
    goal: {
      title: '제작실 웹 반영', summary: '요청한 제작실 변경을 같은 사이트에 게시합니다.',
      scope: { read: ['sites/arcana-studio'], write: ['sites/arcana-studio/app/page.tsx'] },
      acceptance: ['제작실 사이트에 요청한 변경이 반영됩니다.'],
    },
    tasks: [taskFixture('publish', {
      organization: 'development', capabilities: ['publish'], surface: 'app',
      scope: { read: ['sites/arcana-studio'], write: [] },
    })],
  });
  return { command, history, result };
}

test('명시적 웹푸시 지시는 같은 사용자의 제작실 맥락에서 정확한 사이트 게시 근거가 됩니다.', () => {
  const { command } = publicationFixture();
  const intent = command.publicationIntent;
  assert.ok(intent);
  assert.equal(intent.scope, 'sites/arcana-studio');
  assert.equal(intent.siteId, 'appgprj_6aec31b8ed408191954e0d6ed0fa3151');
  assert.equal(intent.actorUserId, command.actorUserId);
  assert.equal(intent.sourceText, command.text);
  assert.deepEqual(verifyPublicationIntent(command, intent), intent);
  assert.ok(derivePublicationIntent(commandFixture({ text: '아르카나 제작실 사이트를 지금 게시해 주세요.' })));
});

test('질문·부정·인용·조건·버튼 구현·다른 게임 대상은 제작실 게시 승인으로 해석하지 않습니다.', () => {
  const { command, history } = publicationFixture();
  for (const text of [
    '제작실을 게시하지 마세요', '제작실을 웹에 게시할 수 있나요?',
    '“제작실 웹푸시하라고”라고 말했어요', '제가 승인하면 제작실을 게시해 주세요',
    '아르카나 제작실에 웹푸시 버튼을 추가해 줘', '제작실 말고 게임을 웹에 게시해주세요',
    '아르카나 제작실에서 게임을 웹에 배포해 주세요', '다른 제작실 사이트에 게시해주세요',
  ]) assert.equal(derivePublicationIntent({ ...command, text }, history), null, text);
  assert.equal(derivePublicationIntent(command, []), null);
  assert.equal(derivePublicationIntent(command, [{ ...history[0], role: 'assistant' }]), null);
  assert.equal(derivePublicationIntent(command, [{ ...history[0], actorUserId: 'another-user' }]), null);
  const { actorUserId: omitted, ...withoutActor } = history[0];
  assert.equal(derivePublicationIntent(command, [withoutActor]), null);
  assert.equal(derivePublicationIntent(command, [...history, { role: 'user', commandId: 'newer-context', actorUserId: command.actorUserId, text: '이제 게임 사이트를 수정해 주세요.' }]), null);
});

test('실제 명령 원문·사용자·고정 게시 대상과 다른 승인 근거를 거부합니다.', () => {
  const { command } = publicationFixture();
  for (const mutate of [
    (intent) => { intent.sourceText = '위조한 사용자 원문'; },
    (intent) => { intent.actorUserId = 'another-user'; },
    (intent) => { intent.sourceCommandId = 'another-command'; },
    (intent) => { intent.siteId = 'another-site'; },
    (intent) => { intent.scope = 'sites'; },
    (intent) => { intent.context.actorUserId = 'another-user'; },
    (intent) => { intent.context.text = '게임 사이트'; },
  ]) {
    const intent = structuredClone(command.publicationIntent);
    mutate(intent);
    assert.throws(() => verifyPublicationIntent(command, intent));
  }
  const result = instructionFixture();
  result.goal.publicationIntent = command.publicationIntent;
  assert.throws(() => normalizeIntake(boardFixture(), result, commandFixture()));
});

test('명시적 사이트 게시만 별도 승인하며 앱 인계·검증·미술 권한은 구분합니다.', () => {
  const { command, result } = publicationFixture();
  for (const modelResult of [result, { ...result, mode: 'existing_goal', goal: null, existingGoalId: 'COOK' }]) {
    const board = boardFixture();
    const before = structuredClone(board);
    const intake = normalizeIntake(board, modelResult, command);
    assert.equal(intake.mode, 'new_goal');
    assert.notEqual(intake.goal.id, 'COOK');
    assert.equal(intake.goal.approval.publish, true);
    assert.equal(intake.goal.approval.newArt, false);
    assert.deepEqual(intake.goal.approval.allowedChecks, []);
    assert.equal(intake.goal.approval.allowedCapabilities.includes('publish'), true);
    assert.equal(intake.goal.approval.allowedCapabilities.includes('test'), false);
    assert.equal(intake.goal.approval.digest, approvalDigest(intake.goal));
    assert.equal(intake.tasks[0].runtime.blockKind, 'app-handoff');
    assert.equal(intake.decisions[0].requestedPublish, false);
    assert.deepEqual(board, before);
  }
});

test('게시 승인이 있어도 다른 경로 수정이나 사이트 입력 없는 작업으로 범위를 넓힐 수 없습니다.', () => {
  const { command, result } = publicationFixture();
  for (const mutate of [
    (value) => { value.goal.scope.write.push('src/cooking'); },
    (value) => { value.tasks[0].scope.write = ['src/cooking/menu.mjs']; },
    (value) => { value.tasks[0].scope.read = ['docs/WORKFLOW.md']; },
    (value) => { value.tasks[0].capabilities = ['code']; },
  ]) {
    const candidate = structuredClone(result);
    mutate(candidate);
    assert.throws(() => normalizeIntake(boardFixture(), candidate, command));
  }
});

test('게시 근거가 없는 기존 목표 지문은 유지하고 게시 근거 변경은 지문에 반영합니다.', () => {
  const goal = boardFixture().goals[0];
  const legacy = {
    id: goal.id, scope: goal.scope, acceptance: goal.acceptance, dependsOnGoals: goal.dependsOnGoals ?? [],
    allowedChecks: goal.approval.allowedChecks,
    allowedCapabilities: goal.approval.allowedCapabilities ?? ['static', 'code', 'content'],
    newArt: goal.approval.newArt, publish: goal.approval.publish, artBriefs: goal.approval.artBriefs ?? [],
  };
  assert.equal(approvalDigest(goal), crypto.createHash('sha256').update(JSON.stringify(legacy)).digest('hex'));
  goal.approval.publicationIntent = publicationFixture().command.publicationIntent;
  assert.notEqual(approvalDigest(goal), goal.approval.digest);
});
