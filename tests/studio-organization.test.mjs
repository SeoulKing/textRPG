import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readBoard, validateBoard, writeBoard, findGoal, findTask, selectTask, transitionTask,
  acquireLock, releaseLock, lockStatus, clearStaleLock, createRun, captureBaseline, isWithinScope,
} from '../scripts/studio/engine.mjs';

import { approvalDigest, assertGoalReady, assertTaskAuthorized, validateResult, validateDirectorResult } from '../scripts/studio/protocol.mjs';

// 실행은 사용자 요청 때만 수행합니다: node --test tests/studio-organization.test.mjs
function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'arcana-studio-test-'));
  const root = path.join(temporary, 'workspace');
  fs.mkdirSync(root);
  t.after(() => {
    if (path.dirname(temporary) !== os.tmpdir() || !path.basename(temporary).startsWith('arcana-studio-test-')) {
      throw new Error('테스트 임시 디렉터리 경계를 확인해 주세요.');
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  return { root, temporary };
}

function boardFixture() {
  return {
    version: 1,
    project: 'arcana',
    settings: { maxConcurrentAgents: 4, defaultMinutes: 90, maxReviewPasses: 2 },
    goals: [{
      id: 'M1', title: '시범판 한 구간', status: 'active',
      approval: {
        status: 'approved', approvedBy: 'user', approvedAt: '2026-11-05T00:00:00.000Z',
        allowedChecks: [], newArt: false, publish: false,
      },
      scope: { write: ['src/feature'] },
      acceptance: ['지정한 플레이 구간이 연결됩니다.'],
    }],
    tasks: [{
      id: 'WORK-001', goalId: 'M1', title: '핵심 플레이 연결',
      organization: 'development', status: 'ready', priority: 1, dependsOn: [],
      scope: { read: ['src/feature'], write: ['src/feature'] },
      capabilities: ['static', 'code'],
      acceptance: ['서버 판정과 표시가 연결됩니다.'],
      playerChange: '의뢰의 결과를 확인할 수 있습니다.', runtime: {},
    }],
    decisions: [], requests: [],
  };
}

function completedTask(task) {
  return {
    ...task, status: 'done',
    runtime: {
      reviewResultPath: '.runtime/studio/runs/fixture/review.json',
      evidence: ['src/feature/result.mjs'],
    },
  };
}

function writeFixture(root, relative, bytes) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return target;
}

function createDirectoryLink(t, target, link) {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) {
      t.skip('현재 환경에서 테스트용 디렉터리 링크를 만들 수 없습니다.');
      return false;
    }
    throw error;
  }
}

function unusedPid() {
  for (let candidate = 2_147_483_647; candidate > 2_147_483_600; candidate -= 1) {
    try {
      process.kill(candidate, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return candidate;
    }
  }
  return null;
}

test('승인되지 않은 목표와 종료한 목표는 작업을 선택하지 않습니다.', () => {
  const board = boardFixture();
  assert.equal(validateBoard(board), board);
  board.goals[0].approval.status = 'pending';
  assert.equal(selectTask(board, 'M1'), null);
  board.goals[0].approval.status = 'approved';
  board.goals[0].status = 'done';
  assert.equal(selectTask(board, 'M1'), null);
  assert.throws(() => findGoal(board, 'MISSING'));
  assert.throws(() => findTask(board, 'MISSING'));
});

test('의존성이 열린 작업만 선택하고 중단된 검토를 제작보다 우선합니다.', () => {
  const board = boardFixture();
  const original = board.tasks[0];
  board.tasks.push({
    ...original, id: 'WORK-002', priority: 0, status: 'backlog',
    dependsOn: ['WORK-001'], runtime: {},
  });
  assert.equal(selectTask(board, 'M1').id, 'WORK-001');
  board.tasks[0] = completedTask(original);
  assert.equal(selectTask(board, 'M1').id, 'WORK-002');
  board.tasks.push({
    ...original, id: 'WORK-003', priority: 99, status: 'review', runtime: {},
  });
  assert.equal(selectTask(board, 'M1').id, 'WORK-003');
  board.tasks[2].status = 'active';
  assert.equal(selectTask(board, 'M1').id, 'WORK-002');
  board.tasks[1].status = 'blocked';
  assert.equal(selectTask(board, 'M1'), null);
});

test('중복 ID, 누락된 의존성, 순환 의존성, 잘못된 목표 참조를 거부합니다.', async (t) => {
  const mutations = [
    ['중복 작업', (board) => board.tasks.push(structuredClone(board.tasks[0]))],
    ['없는 선행 작업', (board) => { board.tasks[0].dependsOn = ['MISSING']; }],
    ['자기 순환', (board) => { board.tasks[0].dependsOn = ['WORK-001']; }],
    ['두 작업 순환', (board) => {
      board.tasks.push({ ...structuredClone(board.tasks[0]), id: 'WORK-002', dependsOn: ['WORK-001'] });
      board.tasks[0].dependsOn = ['WORK-002'];
    }],
    ['없는 목표', (board) => { board.tasks[0].goalId = 'MISSING'; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const board = boardFixture();
      mutate(board);
      assert.throws(() => validateBoard(board));
    });
  }
});

test('경로 경계와 승인된 목표의 수정 범위를 지킵니다.', () => {
  assert.equal(isWithinScope('src/feature/a.mjs', ['src/feature']), true);
  assert.equal(isWithinScope('src/feature', ['src/feature']), true);
  assert.equal(isWithinScope('src/features/a.mjs', ['src/feature']), false);
  assert.equal(isWithinScope('src/feature/../secret', ['src/feature']), false);
  assert.equal(isWithinScope('/src/feature/a.mjs', ['src/feature']), false);
  assert.equal(isWithinScope('C:\\src\\feature\\a.mjs', ['src/feature']), false);

  const board = boardFixture();
  board.tasks[0].scope.write = ['src/another'];
  assert.throws(() => validateBoard(board));
  for (const forbidden of ['.env', '.git/config', 'node_modules/package/file.mjs', '.runtime/studio/lock.json']) {
    const candidate = boardFixture();
    candidate.goals[0].scope.write = [forbidden];
    candidate.tasks[0].scope.write = [forbidden];
    assert.throws(() => validateBoard(candidate), forbidden);
  }
});

test('독립 검토 경로와 증거 없이는 완료할 수 없고 무효 전이는 원장을 바꾸지 않습니다.', () => {
  const board = boardFixture();
  const task = board.tasks[0];
  assert.throws(() => transitionTask(board, task.id, 'done'));
  assert.equal(task.status, 'ready');
  transitionTask(board, task.id, 'active', { producerAttempt: 'attempt-one' });
  transitionTask(board, task.id, 'review', { producerResultPath: 'producer.json' });
  assert.throws(() => transitionTask(board, task.id, 'done', { evidence: ['source.mjs'] }));
  assert.throws(() => transitionTask(board, task.id, 'done', { reviewResultPath: 'review.json', evidence: [] }));
  assert.equal(task.status, 'review');
  transitionTask(board, task.id, 'done', { reviewResultPath: 'review.json', evidence: ['source.mjs'] });
  assert.equal(task.status, 'done');
  assert.equal(task.runtime.producerAttempt, 'attempt-one');
  assert.ok(Number.isFinite(Date.parse(task.updatedAt)));
  assert.throws(() => transitionTask(board, task.id, 'ready'));
});

test('원장 저장은 유효성 검사 뒤에만 교체하며 기존 원장을 보존합니다.', (t) => {
  const { root } = fixture(t);
  const board = boardFixture();
  writeBoard(root, board);
  assert.deepEqual(readBoard(root), board);
  const boardPath = path.join(root, 'docs/studio/board.json');
  const original = fs.readFileSync(boardPath);
  board.tasks[0].dependsOn = ['MISSING'];
  assert.throws(() => writeBoard(root, board));
  assert.deepEqual(fs.readFileSync(boardPath), original);
  assert.deepEqual(fs.readdirSync(path.dirname(boardPath)), ['board.json']);
});

test('현재 총괄의 잠금은 중복 실행과 다른 소유자의 해제를 거부합니다.', (t) => {
  const { root } = fixture(t);
  const lock = acquireLock(root, { owner: 'test-director', goalId: 'M1' });
  assert.equal(lockStatus(root).alive, true);
  assert.equal(lockStatus(root).pid, process.pid);
  assert.throws(() => acquireLock(root, { owner: 'second-director', goalId: 'M1' }));
  assert.throws(() => releaseLock({ ...lock, token: 'wrong-owner' }));
  assert.throws(() => clearStaleLock(root));
  assert.equal(fs.existsSync(lock.path), true);
  assert.equal(releaseLock(lock), true);
  assert.equal(lockStatus(root).locked, false);
  assert.equal(releaseLock(lock), false);
});

test('다른 호스트와 잘못된 잠금은 보존하고 같은 호스트의 죽은 소유자만 해제합니다.', (t) => {
  const { root } = fixture(t);
  const relative = '.runtime/studio/lock.json';
  const lockPath = writeFixture(root, relative, JSON.stringify({
    host: os.hostname() + '-different-host', pid: process.pid, token: 'foreign', owner: 'foreign-director',
  }));
  assert.equal(lockStatus(root).alive, null);
  assert.throws(() => clearStaleLock(root));
  assert.equal(fs.existsSync(lockPath), true);
  fs.writeFileSync(lockPath, '{invalid-json');
  assert.equal(lockStatus(root).invalid, true);
  assert.throws(() => clearStaleLock(root));
  const pid = unusedPid();
  if (pid === null) {
    t.skip('종료된 PID를 확인할 수 없습니다.');
    return;
  }
  fs.writeFileSync(lockPath, JSON.stringify({
    host: os.hostname(), pid, token: 'stale', owner: 'stopped-director',
  }));
  assert.equal(lockStatus(root).alive, false);
  assert.equal(clearStaleLock(root), true);
  assert.equal(fs.existsSync(lockPath), false);
});

test('기준 백업은 원본 바이트와 없는 파일을 기록하며 이후 원본 변경에도 유지됩니다.', (t) => {
  const { root } = fixture(t);
  const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x00, 0xff, 0x0d, 0x0a, 0x41]);
  const source = writeFixture(root, 'src/feature/manual.bin', bytes);
  const task = boardFixture().tasks[0];
  task.scope.write = ['src/feature/manual.bin', 'src/feature/not-created.mjs'];
  const run = createRun(root, 'M1');
  const baseline = captureBaseline(root, run, task);
  assert.equal(baseline.fileCount, 1);
  assert.equal(baseline.totalBytes, bytes.length);
  assert.deepEqual(fs.readFileSync(source), bytes);
  const saved = baseline.entries.find((entry) => entry.path === 'src/feature/manual.bin');
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  const backup = path.join(root, saved.backupPath);
  assert.deepEqual(fs.readFileSync(backup), bytes);
  assert.deepEqual(baseline.entries.find((entry) => entry.path === 'src/feature/not-created.mjs'), {
    path: 'src/feature/not-created.mjs', type: 'missing', existed: false,
  });
  fs.writeFileSync(source, Buffer.from('changed after baseline'));
  assert.deepEqual(fs.readFileSync(backup), bytes);
  const manifest = JSON.parse(fs.readFileSync(baseline.manifestPath, 'utf8'));
  assert.equal(manifest.taskId, task.id);
  assert.equal(manifest.runId, run.id);
});

test('기준 백업은 넓은 루트·위험 경로·실행 디렉터리 밖 출력을 거부합니다.', (t) => {
  const { root } = fixture(t);
  const task = boardFixture().tasks[0];
  const run = createRun(root, 'M1');
  task.scope.write = ['src'];
  assert.throws(() => captureBaseline(root, run, task));
  task.scope.write = ['../outside'];
  assert.throws(() => captureBaseline(root, run, task));
  task.scope.write = ['src/feature'];
  assert.throws(() => captureBaseline(root, { ...run, dir: root }, task));
});

test('작업과 운영 디렉터리의 workspace 밖 junction·symlink를 거부합니다.', async (t) => {
  const { root, temporary } = fixture(t);
  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(root, 'src'));
  if (!createDirectoryLink(t, outside, path.join(root, 'src/feature'))) return;
  const run = createRun(root, 'M1');
  assert.throws(() => captureBaseline(root, run, boardFixture().tasks[0]));
  assert.deepEqual(fs.readdirSync(outside), []);

  await t.test('운영 디렉터리 탈출', (subtest) => {
    const second = fixture(subtest);
    const target = path.join(second.temporary, 'outside-runtime');
    fs.mkdirSync(target);
    if (!createDirectoryLink(subtest, target, path.join(second.root, '.runtime'))) return;
    assert.throws(() => acquireLock(second.root, { owner: 'test', goalId: 'M1' }));
    assert.deepEqual(fs.readdirSync(target), []);
  });
});

test('workspace 안의 기밀 경로를 가리키는 링크도 기준 백업에서 거부합니다.', (t) => {
  const { root } = fixture(t);
  const secretDirectory = path.join(root, '.aws');
  fs.mkdirSync(secretDirectory);
  fs.writeFileSync(path.join(secretDirectory, 'credentials'), 'fixture-only-secret');
  fs.mkdirSync(path.join(root, 'src'));
  if (!createDirectoryLink(t, secretDirectory, path.join(root, 'src/feature'))) return;
  const run = createRun(root, 'M1');
  assert.throws(() => captureBaseline(root, run, boardFixture().tasks[0]));
});

test('작업 실행은 명시된 검증·능력·실행 위치 권한을 확인합니다.', () => {
  const board = boardFixture();
  const task = board.tasks[0];
  task.checks = [];
  assert.equal(assertTaskAuthorized(board, task), task);
  task.surface = 'app';
  assert.throws(() => assertTaskAuthorized(board, task));
  assert.equal(assertTaskAuthorized(board, task, { surface: 'app' }), task);
  task.surface = 'cli';
  task.checks = ['npm.cmd run typecheck'];
  assert.throws(() => assertTaskAuthorized(board, task));
  board.goals[0].approval.allowedChecks = ['npm.cmd run typecheck'];
  assert.equal(assertTaskAuthorized(board, task), task);
  board.goals[0].approval.allowedCapabilities = ['static'];
  assert.throws(() => assertTaskAuthorized(board, task));
  board.goals[0].approval.allowedCapabilities = ['static', 'code', 'art', 'test', 'publish'];
  task.capabilities = ['art'];
  assert.throws(() => assertTaskAuthorized(board, task));
  task.capabilities = ['publish'];
  assert.throws(() => assertTaskAuthorized(board, task));
  task.capabilities = ['test'];
  task.checks = [];
  assert.throws(() => assertTaskAuthorized(board, task));
  task.checks = ['npm.cmd run typecheck'];
  assert.equal(assertTaskAuthorized(board, task), task);
  board.goals[0].approval.status = 'pending';
  assert.throws(() => assertTaskAuthorized(board, task));
});

test('제작자는 목표 안에 있더라도 작업 원장을 수정 범위로 받을 수 없습니다.', () => {
  const board = boardFixture();
  const task = board.tasks[0];
  board.goals[0].scope.write = ['docs/studio'];
  task.scope = { read: [], write: ['docs/studio/board.json'] };
  assert.throws(() => assertTaskAuthorized(board, task));
  task.scope.write = ['docs/studio'];
  assert.throws(() => assertTaskAuthorized(board, task));
  task.scope.write = ['docs/studio/feature-contract.md'];
  assert.equal(assertTaskAuthorized(board, task), task);
});

function resultFixture(task, phase = 'producer') {
  return {
    taskId: task.id, goalId: task.goalId, phase,
    outcome: 'completed', summary: '지정한 원본 연결을 정적으로 확인했습니다.',
    artifacts: phase === 'producer' ? [{ path: 'src/feature/result.mjs', description: '지정한 산출물입니다.' }] : [],
    evidence: [{ path: 'src/feature/result.mjs', claim: '연결된 코드가 존재합니다.', kind: 'source', command: '' }],
    issues: [], requests: [], failure: null,
  };
}

test('결과는 작업·목표·단계와 실제 증거를 확인하며 제작자의 자체 인수를 거부합니다.', (t) => {
  const { root } = fixture(t);
  const task = boardFixture().tasks[0];
  writeFixture(root, 'src/feature/result.mjs', 'export const result = true;');
  const context = { task, phase: 'producer' };
  const result = resultFixture(task);
  assert.equal(validateResult(root, result, context), result);
  assert.throws(() => validateResult(root, { ...result, taskId: 'ANOTHER' }, context));
  assert.throws(() => validateResult(root, { ...result, goalId: 'ANOTHER' }, context));
  assert.throws(() => validateResult(root, { ...result, phase: 'reviewer' }, context));
  assert.throws(() => validateResult(root, { ...result, approved: true }, context));
  assert.throws(() => validateResult(root, { ...result, evidence: [] }, context));
  assert.throws(() => validateResult(root, {
    ...result, evidence: [{ ...result.evidence[0], path: 'src/feature/missing.mjs' }],
  }, context));
  assert.throws(() => validateResult(root, {
    ...result, outcome: 'blocked', failure: null,
  }, context));
  const review = resultFixture(task, 'reviewer');
  assert.equal(validateResult(root, review, { task, phase: 'reviewer' }), review);
  assert.throws(() => validateResult(root, { ...review, artifacts: result.artifacts }, { task, phase: 'reviewer' }));
  assert.throws(() => validateResult(root, { ...result, outcome: 'needs_changes' }, context));
});

test('실행 증거는 승인 명령과 일치해야 하며 정적 증거로 명령을 위장할 수 없습니다.', (t) => {
  const { root } = fixture(t);
  const task = boardFixture().tasks[0];
  task.checks = ['node --check src/feature/result.mjs'];
  writeFixture(root, 'src/feature/result.mjs', 'export const result = true;');
  const result = resultFixture(task);
  const context = { task, phase: 'producer' };
  result.evidence[0].kind = 'runtime';
  result.evidence[0].command = task.checks[0];
  assert.equal(validateResult(root, result, context), result);
  result.evidence[0].command = 'npm test';
  assert.throws(() => validateResult(root, result, context));
  result.evidence[0].kind = 'static';
  assert.throws(() => validateResult(root, result, context));
  result.evidence[0].command = '';
  assert.equal(validateResult(root, result, context), result);
});

test('완료 결과는 선행 보완 요청을 남길 수 없고 검토자는 새 요청을 만들 수 없습니다.', (t) => {
  const { root } = fixture(t);
  const task = boardFixture().tasks[0];
  writeFixture(root, 'src/feature/result.mjs', 'export const result = true;');
  const request = {
    title: '서사 보완', organization: 'narrative', playerChange: '의뢰 조건이 일치합니다.',
    blocking: true, dependsOn: [], scope: { read: ['src/feature'], write: ['src/feature/story.json'] },
    capabilities: ['content'], checks: [], acceptance: ['서버 조건과 일치합니다.'], surface: 'cli',
  };
  const result = resultFixture(task);
  result.requests.push(request);
  assert.throws(() => validateResult(root, result, { task, phase: 'producer' }));
  result.outcome = 'blocked';
  result.failure = { fingerprint: 'story:condition:mismatch', conditionToRetry: '서사 조건을 수정한 뒤 재개합니다.' };
  assert.equal(validateResult(root, result, { task, phase: 'producer' }), result);
  const review = resultFixture(task, 'reviewer');
  review.requests.push({ ...request, blocking: false });
  assert.throws(() => validateResult(root, review, { task, phase: 'reviewer' }));
});

test('총괄은 기존 요청만 한 번씩 결정할 수 있으며 목표 승인을 확장할 수 없습니다.', () => {
  const result = { goalId: 'M1', summary: '요청을 배정합니다.', decisions: [
    { requestId: 'REQ-1', action: 'accept', reason: '승인 범위 안의 선행 작업입니다.' },
  ] };
  const context = { goalId: 'M1', requestIds: ['REQ-1'] };
  assert.equal(validateDirectorResult(result, context), result);
  assert.throws(() => validateDirectorResult({ ...result, goalId: 'M2' }, context));
  assert.throws(() => validateDirectorResult({ ...result, approval: true }, context));
  assert.throws(() => validateDirectorResult({
    ...result, decisions: [{ ...result.decisions[0], requestId: 'UNKNOWN' }],
  }, context));
  assert.throws(() => validateDirectorResult({
    ...result, decisions: [result.decisions[0], result.decisions[0]],
  }, context));
  assert.throws(() => validateDirectorResult({
    ...result, decisions: [{ ...result.decisions[0], action: 'approve' }],
  }, context));
});

test('원장에 직접 완료 상태를 기록해도 독립 검토 경로와 증거가 필요합니다.', () => {
  const board = boardFixture();
  board.tasks[0].status = 'done';
  board.tasks[0].runtime = {};
  assert.throws(() => validateBoard(board));
  board.tasks[0].runtime = { reviewResultPath: 'review.json', evidence: [] };
  assert.throws(() => validateBoard(board));
  board.tasks[0] = completedTask(board.tasks[0]);
  assert.equal(validateBoard(board), board);
});

test('목표 실행은 승인 계약의 지문과 선행 목표 인수를 확인합니다.', () => {
  const board = boardFixture();
  const goal = board.goals[0];
  goal.approval.digest = approvalDigest(goal);
  assert.equal(assertGoalReady(board, goal), goal);
  goal.acceptance.push('승인 뒤 추가한 조건입니다.');
  assert.throws(() => assertGoalReady(board, goal));
  goal.acceptance.pop();
  const predecessor = structuredClone(goal);
  predecessor.id = 'M0';
  predecessor.status = 'active';
  predecessor.approval.digest = approvalDigest(predecessor);
  board.goals.unshift(predecessor);
  goal.dependsOnGoals = ['M0'];
  goal.approval.digest = approvalDigest(goal);
  assert.throws(() => assertGoalReady(board, goal));
  predecessor.status = 'done';
  assert.equal(assertGoalReady(board, goal), goal);
});
