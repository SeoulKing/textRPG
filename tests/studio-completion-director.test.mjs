import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionTask, validateBoard } from '../scripts/studio/engine.mjs';
import { approvalDigest } from '../scripts/studio/protocol.mjs';
import { recordTaskCompletion, buildCollaborationSnapshot } from '../scripts/studio/collaboration.mjs';
import {
  createCompletionSchema, buildCompletionPrompt, beginCompletionReview, normalizeCompletionDecision,
  applyCompletionDecision, failCompletionReview, retryCompletionReview,
} from '../scripts/studio/completion-director.mjs';

// 실행은 사용자 요청 때만 수행합니다: node --test tests/studio-completion-director.test.mjs
// 실제 파일·원장·모델·게임·브라우저 없이 완료 보고 계약만 다루는 사례입니다.
const REPORT = 'COMPLETE-WORLD-1';

function fixture({ withNext = true, complete = true } = {}) {
  const goal = {
    id: 'SCHOOL', title: '학교 개선', status: 'active', dependsOnGoals: [],
    sourceInstruction: { commandId: 'OWNER-REQUEST', actorUserId: 'owner', text: '학교 내부를 꾸며 주세요.' },
    scope: { read: ['src/school'], write: ['src/school'] }, acceptance: ['가구가 배치됩니다.', '이동 동선이 연결됩니다.'],
    approval: {
      status: 'approved', approvedBy: 'owner', approvedAt: '2026-11-05T00:00:00.000Z',
      allowedCapabilities: ['static', 'code', 'content', 'ui'], allowedChecks: [], newArt: false, publish: false,
    },
  };
  goal.approval.digest = approvalDigest(goal);
  const source = {
    id: 'WORLD-1', goalId: goal.id, title: '학교 가구 배치', organization: 'world', status: 'review', priority: 1,
    playerChange: '가구가 보입니다.', dependsOn: [], capabilities: ['content'], checks: [], surface: 'cli',
    scope: { read: ['src/school'], write: ['src/school/scene.mjs'] }, acceptance: ['기존 가구가 배치됩니다.'],
    runtime: { producerSummary: 'PRODUCER-SCHOOL-RESULT', reviewSummary: 'REVIEW-SCHOOL-RESULT',
      producerEvidence: [{ path: 'src/school/scene.mjs', summary: '가구 배치' }], sourceCommandId: 'OWNER-REQUEST' },
  };
  const next = {
    id: 'CONNECT-1', goalId: goal.id, title: '학교 상호작용 연결', organization: 'development', status: 'ready', priority: 2,
    playerChange: '가구와 상호작용합니다.', dependsOn: [source.id], capabilities: ['code'], checks: [], surface: 'cli',
    scope: { read: ['src/school'], write: ['src/school/connect.mjs'] }, acceptance: ['가구의 동작이 연결됩니다.'], runtime: {},
  };
  const board = {
    version: 1, project: 'arcana', settings: { maxConcurrentAgents: 4, defaultMinutes: 90, maxReviewPasses: 2 },
    goals: [goal], tasks: withNext ? [source, next] : [source], requests: [], decisions: [],
  };
  if (complete) transitionTask(board, source.id, 'done', {
    reviewResultPath: '.runtime/studio/runs/source/review.json', reviewSummary: 'REVIEW-SCHOOL-RESULT',
    evidence: ['src/school/scene.mjs — 가구와 동선 연결 근거'],
  });
  return validateBoard(board);
}

function decision(overrides = {}) {
  return { reportId: REPORT, goalId: 'SCHOOL', action: 'continue', summary: '남아 있는 개발 작업을 이어갑니다.',
    nextTaskIds: ['CONNECT-1'], tasks: [], acceptanceEvidence: [], blockedReason: null, ...overrides };
}

function followUp(localId = 'integrate', overrides = {}) {
  return {
    localId, title: '최종 진입점 연결 보완', organization: 'development', playerChange: '학교 진입점에서 배치를 사용할 수 있습니다.',
    dependsOn: ['WORLD-1'], scope: { read: ['src/school'], write: ['src/school/entry.mjs'] },
    capabilities: ['code'], checks: [], acceptance: ['실제 진입점이 최신 배치를 참조합니다.'], surface: 'cli', ...overrides,
  };
}

function readyDecision() {
  return decision({ action: 'ready_for_acceptance', nextTaskIds: [], acceptanceEvidence: fixture({ withNext: false }).goals[0].acceptance.map((criterion) => ({
    criterion, completedTaskIds: ['WORLD-1'], evidence: [{ path: 'src/school/scene.mjs', summary: criterion }],
  })) });
}

test('새 독립 검토 통과만 내구 완료 보고를 만들며 과거 done을 소급 보고하지 않습니다.', () => {
  const board = fixture();
  assert.equal(board.completionReports.length, 1);
  assert.equal(board.completionReports[0].id, REPORT);
  assert.equal(board.completionReports[0].status, 'pending');
  assert.deepEqual(board.completionReports[0].sourceCommandIds, ['OWNER-REQUEST']);
  assert.equal(board.goals[0].status, 'active');
  recordTaskCompletion(board, board.tasks[0]);
  assert.equal(board.completionReports.length, 1);
  const historical = fixture();
  delete historical.completionReports;
  delete historical.goals[0].supervision;
  validateBoard(historical);
  buildCollaborationSnapshot(historical);
  assert.equal(historical.completionReports, undefined);
  const inReview = fixture({ complete: false });
  assert.throws(() => recordTaskCompletion(inReview, inReview.tasks[0]));
});

test('같은 완료 보고는 한 번만 시작하며 보고·목표 ID를 위조할 수 없습니다.', () => {
  const board = fixture();
  const before = structuredClone(board);
  const processing = beginCompletionReview(board, REPORT);
  assert.equal(processing.completionReports[0].status, 'processing');
  assert.equal(processing.completionReports[0].attempts, 1);
  assert.throws(() => beginCompletionReview(processing, REPORT));
  assert.throws(() => normalizeCompletionDecision(processing, REPORT, decision({ reportId: 'OTHER' })));
  assert.throws(() => normalizeCompletionDecision(processing, REPORT, decision({ goalId: 'OTHER' })));
  assert.deepEqual(board, before);
  const prompt = buildCompletionPrompt(processing, REPORT);
  for (const value of ['PRODUCER-SCHOOL-RESULT', 'REVIEW-SCHOOL-RESULT', '가구가 배치됩니다.', '이동 동선이 연결됩니다.', 'src/school/scene.mjs']) assert.ok(prompt.includes(value), value);
});

test('continue는 기존 준비 작업을 지정하고 중복 작업·보고 재적용을 만들지 않습니다.', () => {
  const board = beginCompletionReview(fixture(), REPORT);
  const patch = normalizeCompletionDecision(board, REPORT, decision());
  const result = applyCompletionDecision(board, REPORT, patch);
  assert.equal(result.tasks.length, board.tasks.length);
  assert.deepEqual(result.goals[0].supervision.nextTaskIds, ['CONNECT-1']);
  assert.equal(result.completionReports[0].status, 'processed');
  assert.deepEqual(applyCompletionDecision(result, REPORT, patch), result);
  assert.throws(() => beginCompletionReview(result, REPORT));
  const tampered = structuredClone(patch);
  tampered.rawResult.summary = '검증 이후 다른 내용';
  assert.throws(() => applyCompletionDecision(board, REPORT, tampered));
  for (const id of ['WORLD-1', 'MISSING']) assert.throws(() => normalizeCompletionDecision(board, REPORT, decision({ nextTaskIds: [id] })));
  for (const status of ['active', 'blocked']) {
    const candidate = structuredClone(board);
    candidate.tasks[1].status = status;
    assert.throws(() => normalizeCompletionDecision(candidate, REPORT, decision()));
  }
});

test('후속 부서는 별칭 DAG와 실제 원문 출처를 이어받고 앱 작업은 인계를 기다립니다.', () => {
  const board = beginCompletionReview(fixture(), REPORT);
  const result = decision({ action: 'follow_up', nextTaskIds: [], tasks: [
    followUp('inspect', { title: '최종 정적 통합 검토', organization: 'quality', playerChange: '연결 누락을 확인합니다.',
      dependsOn: ['integrate'], capabilities: ['static'], scope: { read: ['src/school'], write: [] }, acceptance: ['실제 호출 경로에 누락이 없습니다.'] }),
    followUp('integrate'),
  ] });
  const patch = normalizeCompletionDecision(board, REPORT, result);
  assert.deepEqual(patch.tasks[0].dependsOn, ['WORLD-1', patch.tasks[1].id]);
  assert.deepEqual(patch.nextTaskIds, [patch.tasks[1].id, patch.tasks[0].id]);
  const applied = applyCompletionDecision(board, REPORT, patch);
  assert.equal(applied.tasks.length, board.tasks.length + 2);
  assert.deepEqual(applied.tasks.at(-1).runtime.sourceCommandIds, ['OWNER-REQUEST']);
  assert.equal(applied.goals[0].approval.digest, board.goals[0].approval.digest);
  const app = normalizeCompletionDecision(board, REPORT, decision({ action: 'follow_up', nextTaskIds: [], tasks: [followUp('app', { surface: 'app' })] }));
  assert.equal(app.tasks[0].status, 'blocked');
  assert.equal(app.tasks[0].runtime.blockKind, 'app-handoff');
});

test('새 후속 작업이 기존 준비 작업에 의존하면 기존 선행 작업을 먼저 실행 대상으로 지정합니다.', () => {
  const board = beginCompletionReview(fixture(), REPORT);
  const patch = normalizeCompletionDecision(board, REPORT, decision({
    action: 'follow_up', nextTaskIds: [], tasks: [followUp('finalize', { dependsOn: ['CONNECT-1'] })],
  }));
  const existingIndex = patch.nextTaskIds.indexOf('CONNECT-1');
  const followUpIndex = patch.nextTaskIds.indexOf(patch.tasks[0].id);
  assert.ok(existingIndex >= 0);
  assert.ok(followUpIndex > existingIndex);
  const result = applyCompletionDecision(board, REPORT, patch);
  assert.equal(result.tasks.filter((task) => task.id === 'CONNECT-1').length, 1);
  assert.equal(result.tasks.find((task) => task.id === 'CONNECT-1').status, 'ready');
  assert.equal(result.tasks.length, board.tasks.length + 1);
});

test('총괄은 앱 도구 인계 대기를 지정할 수 있지만 일반 차단 작업을 실행 가능 상태로 바꾸지 않습니다.', () => {
  for (const blockKind of ['app', 'app-handoff']) {
    const board = beginCompletionReview(fixture(), REPORT);
    Object.assign(board.tasks[1], { status: 'blocked', surface: 'app' });
    board.tasks[1].runtime = { blockKind, blockReason: '앱 도구 인계를 기다립니다.' };
    const patch = normalizeCompletionDecision(board, REPORT, decision());
    const result = applyCompletionDecision(board, REPORT, patch);
    assert.deepEqual(result.goals[0].supervision.nextTaskIds, ['CONNECT-1']);
    assert.equal(result.goals[0].supervision.status, 'continuing');
    assert.equal(result.completionReports[0].status, 'processed');
    assert.equal(result.tasks[1].status, 'blocked');
    assert.equal(result.tasks[1].runtime.blockKind, blockKind);
  }
  for (const blockKind of ['permission', 'review', 'interrupted']) {
    const board = beginCompletionReview(fixture(), REPORT);
    Object.assign(board.tasks[1], { status: 'blocked', surface: 'app' });
    board.tasks[1].runtime = { blockKind };
    assert.throws(() => normalizeCompletionDecision(board, REPORT, decision()));
  }
});

test('후속 작업으로 승인·경로·동일 목적·작업 수·선행 관계를 확대하거나 반복할 수 없습니다.', () => {
  const board = beginCompletionReview(fixture(), REPORT);
  for (const tasks of [
    [followUp('outside', { scope: { read: ['src/school'], write: ['src/another/file.mjs'] } })],
    [followUp('art', { capabilities: ['art'] })],
    [followUp('test', { capabilities: ['test'], checks: ['npm test'] })],
    [followUp('secret', { scope: { read: ['.runtime/studio/bridge-secrets.json'], write: [] } })],
    [followUp('repeat', { title: board.tasks[0].title, organization: board.tasks[0].organization })],
    [followUp('cycle', { dependsOn: ['cycle'] })],
    [followUp('missing', { dependsOn: ['MISSING'] })],
    Array.from({ length: 5 }, (_, index) => followUp('task' + index)),
  ]) assert.throws(() => normalizeCompletionDecision(board, REPORT, decision({ action: 'follow_up', nextTaskIds: [], tasks })));
});

test('목표의 모든 조건을 실제 완료 작업의 제출 근거로 확인해도 사용자 인수는 남깁니다.', () => {
  const board = beginCompletionReview(fixture({ withNext: false }), REPORT);
  const patch = normalizeCompletionDecision(board, REPORT, readyDecision());
  const result = applyCompletionDecision(board, REPORT, patch);
  assert.equal(result.goals[0].supervision.status, 'ready_for_acceptance');
  assert.equal(result.goals[0].status, 'active');
  assert.equal(result.tasks[0].status, 'done');
  assert.equal(result.goals[0].supervision.acceptanceEvidence.length, board.goals[0].acceptance.length);
});

test('누락·임의 근거·미완료 작업·미해결 요청·차단 판단이 있으면 목표 전체 완료로 인수하지 않습니다.', () => {
  const base = beginCompletionReview(fixture({ withNext: false }), REPORT);
  for (const mutate of [
    (result) => { result.acceptanceEvidence.pop(); },
    (result) => { result.acceptanceEvidence[0].criterion = '모델이 새로 만든 조건'; },
    (result) => { result.acceptanceEvidence[0].evidence[0].path = 'src/school/unsubmitted.mjs'; },
    (result) => { result.acceptanceEvidence[0].completedTaskIds = ['MISSING']; },
  ]) {
    const result = readyDecision(); mutate(result);
    assert.throws(() => normalizeCompletionDecision(base, REPORT, result));
  }
  assert.throws(() => normalizeCompletionDecision(beginCompletionReview(fixture(), REPORT), REPORT, readyDecision()));
  for (const status of ['pending', 'escalated', 'deferred']) {
    const board = structuredClone(base);
    board.requests.push({ id: 'UNRESOLVED', goalId: 'SCHOOL', status, blocking: true });
    assert.throws(() => normalizeCompletionDecision(board, REPORT, readyDecision()));
  }
  const blocked = structuredClone(base);
  blocked.decisions.push({ id: 'DECISION', goalId: 'SCHOOL', status: 'pending', blocking: true });
  assert.throws(() => normalizeCompletionDecision(blocked, REPORT, readyDecision()));
});

test('총괄 실패는 자동 재호출을 막고 명시 재개는 done 작업을 유지하며 새 시도 기록을 남깁니다.', () => {
  const processing = beginCompletionReview(fixture(), REPORT);
  const failed = failCompletionReview(processing, REPORT, new Error('연결 실패'));
  assert.equal(failed.completionReports[0].status, 'blocked');
  assert.equal(failed.goals[0].supervision.status, 'blocked');
  assert.ok(failed.decisions.some((item) => item.sourceCompletionReportId === REPORT && item.status === 'pending'));
  assert.throws(() => beginCompletionReview(failed, REPORT));
  assert.deepEqual(failCompletionReview(failed, REPORT, new Error('반복 실패')), failed);
  assert.throws(() => retryCompletionReview(failed, REPORT, { reason: '', by: 'owner' }));
  const resumed = retryCompletionReview(failed, REPORT, { reason: '연결 설정을 수정했습니다.', by: 'owner', sourceCommandId: 'MANUAL-RESUME' });
  assert.equal(resumed.tasks[0].status, 'done');
  assert.equal(resumed.completionReports[0].status, 'pending');
  assert.equal(resumed.completionReports[0].retries.length, 1);
  assert.ok(resumed.completionReports[0].sourceCommandIds.includes('MANUAL-RESUME'));
  const again = beginCompletionReview(resumed, REPORT);
  assert.equal(again.collaborationEvents.filter((event) => event.kind === 'completion_review_started').length, 2);
  const failedAgain = failCompletionReview(again, REPORT, new Error('다른 연결 실패'));
  assert.throws(() => retryCompletionReview(failedAgain, REPORT, { reason: '연결 설정을 수정했습니다.', by: 'owner' }));
});

test('다른 부서의 새 완료 보고가 이전에 차단된 총괄 확인을 덮어쓰지 않습니다.', () => {
  const board = failCompletionReview(beginCompletionReview(fixture(), REPORT), REPORT, new Error('총괄 확인 실패'));
  transitionTask(board, 'CONNECT-1', 'active');
  transitionTask(board, 'CONNECT-1', 'review');
  transitionTask(board, 'CONNECT-1', 'done', {
    reviewResultPath: '.runtime/studio/runs/connect/review.json', evidence: ['src/school/connect.mjs — 연결 결과'],
  });
  assert.equal(board.completionReports.length, 2);
  assert.equal(board.completionReports[1].status, 'pending');
  assert.equal(board.goals[0].supervision.status, 'blocked');
  assert.equal(buildCollaborationSnapshot(board).goals[0].current.status, 'blocked');
});

test('후속24개 상한은 원래 완료 작업과 구분해 자동 생성 작업에만 적용합니다.', () => {
  const board = beginCompletionReview(fixture({ withNext: false }), REPORT);
  for (let index = 0; index < 24; index += 1) board.tasks.push({ ...structuredClone(board.tasks[0]),
    id: 'ORIGINAL-' + index, title: '원래 작업 ' + index, playerChange: '원래 작업 결과 ' + index,
    acceptance: ['원래 조건 ' + index], runtime: { ...structuredClone(board.tasks[0].runtime), completionReportId: 'OLD-' + index },
  });
  const result = decision({ action: 'follow_up', nextTaskIds: [], tasks: [followUp()] });
  assert.equal(normalizeCompletionDecision(board, REPORT, result).tasks.length, 1);
  for (const task of board.tasks.slice(1)) task.runtime.createdByCompletionReportId = 'PREVIOUS-AUTO';
  assert.throws(() => normalizeCompletionDecision(board, REPORT, result));
});

test('완료 응답 스키마는 새 호출에 독립적이며 모델 승인 필드는 받아들이지 않습니다.', () => {
  const first = createCompletionSchema();
  first.required.length = 0;
  assert.ok(createCompletionSchema().required.includes('acceptanceEvidence'));
  const result = decision({ approval: { publish: true } });
  assert.throws(() => normalizeCompletionDecision(beginCompletionReview(fixture(), REPORT), REPORT, result));
});
