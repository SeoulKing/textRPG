import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollaborationSnapshot, buildTaskHandoff, collaborationEvidence,
  recordCollaboration, recordTaskHandoffs, validateCollaborationEvents,
} from '../scripts/studio/collaboration.mjs';
import { approvalDigest, formatTaskPrompt } from '../scripts/studio/protocol.mjs';

// 실행은 사용자 요청 때만 수행합니다: node --test tests/studio-collaboration.test.mjs
// 임시 파일·실제 원장·모델·브라우저·게임을 사용하지 않는 협업 계약 사례입니다.
function fixture() {
  const goal = {
    id: 'SCHOOL', title: '학교 공간 개선', status: 'active', dependsOnGoals: [],
    sourceInstruction: { commandId: 'COMMAND-ROOT', actorUserId: 'owner', text: '학교 내부를 채워 주세요.' },
    scope: { read: ['src/school'], write: ['src/school'] }, acceptance: ['소품과 이동 동선이 연결됩니다.'],
    approval: {
      status: 'approved', approvedBy: 'owner', approvedAt: '2026-11-05T00:00:00.000Z',
      allowedCapabilities: ['static', 'code', 'content', 'ui'], allowedChecks: [], newArt: false, publish: false,
    },
  };
  goal.approval.digest = approvalDigest(goal);
  const source = {
    id: 'WORLD-1', goalId: goal.id, title: '공간 배치', organization: 'world', status: 'done', priority: 1,
    playerChange: '교실 소품이 배치됩니다.', dependsOn: [],
    scope: { read: ['src/school'], write: ['src/school/interior.mjs'] }, capabilities: ['content'], checks: [],
    acceptance: ['배치 자료를 후속 부서에 제공합니다.'], runtime: {
      sourceCommandId: 'COMMAND-ROOT', producerSummary: 'WORLD-PRODUCER-RESULT', reviewSummary: 'WORLD-REVIEW-RESULT',
      producerResultPath: '.runtime/studio/runs/world/producer.json', reviewResultPath: '.runtime/studio/runs/world/review.json',
      evidence: ['src/school/interior.mjs — WORLD-EVIDENCE'],
    },
  };
  const target = {
    id: 'DEV-1', goalId: goal.id, title: '학교 연결', organization: 'development', status: 'ready', priority: 2,
    playerChange: '배치한 소품과 상호작용할 수 있습니다.', dependsOn: [source.id],
    scope: { read: ['src/school'], write: ['src/school/connect.mjs'] }, capabilities: ['code'], checks: [],
    acceptance: ['공간 배치를 실제 진입점에 연결합니다.'], runtime: {
      sourceCommandId: 'COMMAND-FOLLOWUP', sourceRequestId: 'REQUEST-1', sourceTaskId: source.id,
    },
  };
  return {
    version: 1, project: 'arcana', settings: { maxConcurrentAgents: 4, defaultMinutes: 90, maxReviewPasses: 2 },
    goals: [goal], tasks: [source, target], decisions: [], requests: [{
      id: 'REQUEST-1', goalId: goal.id, sourceTaskId: source.id, taskId: target.id, organization: 'development',
      title: '상호작용 연결 요청', status: 'accepted', blocking: true,
      playerChange: 'SOURCE-REQUEST-REASON', directorReason: 'DIRECTOR-ACCEPTANCE-REASON', sourceCommandIds: ['COMMAND-ROOT'],
    }],
  };
}

function dependencyLink(board) {
  return buildCollaborationSnapshot(board).goals[0].links.find((link) => link.kind === 'dependency' && link.fromTaskId === 'WORLD-1' && link.toTaskId === 'DEV-1');
}

test('기록이 없는 과거 원장과 의존성 계획을 실제 전달 기록으로 소급하지 않습니다.', () => {
  const board = fixture();
  const before = structuredClone(board);
  const view = buildCollaborationSnapshot(board).goals[0];
  assert.equal(view.steps.some((step) => step.provenance === 'recorded'), false);
  assert.ok(view.steps.some((step) => step.provenance === 'legacy' && step.taskId === 'WORLD-1'));
  assert.equal(dependencyLink(board).status, 'ready');
  assert.notEqual(dependencyLink(board).status, 'delivered');
  assert.deepEqual(board, before);
});

test('동일 이벤트 재반영은 중복되지 않고 명령·작업·요청의 출처를 보존합니다.', () => {
  const board = fixture();
  const event = {
    id: 'ASSIGN-DEV-1', goalId: 'SCHOOL', taskId: 'DEV-1', requestId: 'REQUEST-1', kind: 'director_assigned',
    fromDepartmentId: 'director', toDepartmentId: 'development', title: '요청 수락 및 작업 배정',
  };
  const recorded = recordCollaboration(board, event);
  assert.strictEqual(recordCollaboration(board, event), recorded);
  assert.equal(board.collaborationEvents.length, 1);
  assert.equal(recorded.provenance, 'recorded');
  assert.deepEqual(new Set(recorded.sourceCommandIds), new Set(['COMMAND-ROOT', 'COMMAND-FOLLOWUP']));
  validateCollaborationEvents(board);
});

test('선행 제작·검토·근거와 요청 수락 이유가 실제 다음 작업 프롬프트에 들어갑니다.', () => {
  const board = fixture();
  const target = board.tasks[1];
  const handoff = buildTaskHandoff(board, target);
  assert.equal(handoff.dependencies[0].summary, 'WORLD-PRODUCER-RESULT');
  assert.equal(handoff.dependencies[0].reviewSummary, 'WORLD-REVIEW-RESULT');
  assert.ok(handoff.dependencies[0].evidence.some((item) => item.path === 'src/school/interior.mjs'));
  assert.equal(handoff.requests[0].directorReason, 'DIRECTOR-ACCEPTANCE-REASON');
  const prompt = formatTaskPrompt(board, target, 'producer', { runRelative: '.runtime/studio/runs/target' });
  for (const text of ['WORLD-PRODUCER-RESULT', 'WORLD-REVIEW-RESULT', 'WORLD-EVIDENCE', 'SOURCE-REQUEST-REASON', 'DIRECTOR-ACCEPTANCE-REASON']) {
    assert.ok(prompt.includes(text), text);
  }
});

test('프롬프트 준비와 응답 수신을 구분하고 품질 부서 수신을 개발 부서 전달로 표시하지 않습니다.', () => {
  const board = fixture();
  recordTaskHandoffs(board, board.tasks[1], 'producer', { status: 'prepared' });
  assert.notEqual(dependencyLink(board).status, 'delivered');
  assert.ok(board.collaborationEvents.every((event) => event.status === 'prepared'));
  recordTaskHandoffs(board, board.tasks[1], 'reviewer', { status: 'delivered', producerResult: { summary: 'DEV-RESULT', evidence: [] } });
  assert.notEqual(dependencyLink(board).status, 'delivered');
  recordTaskHandoffs(board, board.tasks[1], 'producer', { status: 'delivered' });
  assert.equal(dependencyLink(board).status, 'delivered');
  recordTaskHandoffs(board, board.tasks[1], 'producer', { status: 'prepared' });
  assert.notEqual(dependencyLink(board).status, 'delivered');
  validateCollaborationEvents(board);
});

test('차단·반려·미배정 요청은 완료나 배정으로 바꾸지 않습니다.', () => {
  const board = fixture();
  board.tasks[1].status = 'blocked';
  board.tasks[1].runtime.blockReason = '추가 승인을 기다립니다.';
  recordCollaboration(board, { goalId: 'SCHOOL', taskId: 'DEV-1', kind: 'rejected', status: 'needs_changes',
    fromDepartmentId: 'quality', toDepartmentId: 'development', title: '보완 요청', reason: '이동 동선 수정이 필요합니다.' });
  board.requests[0].status = 'pending';
  delete board.requests[0].taskId;
  const view = buildCollaborationSnapshot(board).goals[0];
  assert.ok(view.steps.some((step) => step.kind === 'rejected' && step.status === 'needs_changes' && step.provenance === 'recorded'));
  assert.ok(view.steps.some((step) => step.requestId === 'REQUEST-1' && step.status === 'pending' && step.provenance === 'legacy'));
  assert.equal(view.current.departmentId, 'director');
  assert.notEqual(view.current.status, 'done');
  assert.equal(view.links.some((link) => link.kind === 'request'), false);
});

test('이벤트의 주 작업·요청은 해당 목표에 속해야 하며 선행 관련 작업은 교차 목표를 허용합니다.', () => {
  const board = fixture();
  board.goals.push({ ...structuredClone(board.goals[0]), id: 'OTHER' });
  assert.throws(() => recordCollaboration(board, { goalId: 'OTHER', taskId: 'DEV-1', kind: 'started' }));
  assert.throws(() => recordCollaboration(board, { goalId: 'OTHER', requestId: 'REQUEST-1', kind: 'request_submitted' }));
  const related = { ...structuredClone(board.tasks[0]), id: 'OTHER-SOURCE', goalId: 'OTHER' };
  board.tasks.push(related);
  recordCollaboration(board, { goalId: 'SCHOOL', taskId: 'DEV-1', relatedTaskId: related.id, kind: 'handoff', status: 'prepared' });
  validateCollaborationEvents(board);
  board.collaborationEvents[0].goalId = 'OTHER';
  assert.throws(() => validateCollaborationEvents(board));
});

test('공유 근거에는 결과 파일만 남기고 자격 증명·원시 로그·추론·프롬프트를 제외합니다.', () => {
  const evidence = collaborationEvidence([
    'src/school/interior.mjs — 정상 결과', '.runtime/studio/runs/run/result.json — 정리된 보고',
    '.runtime/studio/bridge-secrets.json — 연결 비밀', '.aws/credentials — 비밀', '../outside — 외부',
    '.runtime/studio/runs/run/events.jsonl — 원시 이벤트', '.runtime/studio/runs/run/worker.stderr.txt — 실행 로그',
    '.runtime/studio/runs/run/worker.prompt.txt — 내부 프롬프트', '.runtime/studio/runs/run/reasoning.json — 추론',
  ]);
  assert.deepEqual(evidence.map((item) => item.path), ['src/school/interior.mjs', '.runtime/studio/runs/run/result.json']);
});
