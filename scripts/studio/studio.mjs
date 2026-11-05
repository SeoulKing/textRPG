import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { handleAppCommand } from './app.mjs';
import { resolveExecution, codexModelArgs } from './model-policy.mjs';
import {
  readBoard, writeBoard, validateBoard, findGoal, findTask, selectTask, transitionTask,
  acquireLock, releaseLock, lockStatus, clearStaleLock, createRun, captureBaseline, isWithinScope,
} from './engine.mjs';
import {
  assertTaskAuthorized, validateResult, validateDirectorResult, formatTaskPrompt, formatDirectorPrompt,
  approvalDigest as goalDigest, assertGoalReady as assertGoal,
} from './protocol.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const relative = (value) => path.relative(ROOT, value).split(path.sep).join('/');
const now = () => new Date().toISOString();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
const saveJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', 'utf8');

function options(argv) {
  const [command = 'help', ...rest] = argv;
  const result = { command };
  const valued = new Set(['goal', 'task', 'phase', 'minutes', 'by', 'digest', 'reason', 'codex', 'producer', 'review']);
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index].replace(/^--/, '');
    if (!rest[index].startsWith('--') || !valued.has(key)) throw new Error('알 수 없는 옵션입니다: ' + rest[index]);
    const value = rest[++index];
    if (!value || value.startsWith('--') || result[key] !== undefined) throw new Error('옵션 값을 확인해 주세요: --' + key);
    result[key] = value;
  }
  return result;
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + '을 지정해 주세요.');
  return value;
}

function status(board, args) {
  const goals = args.goal ? [findGoal(board, args.goal)] : board.goals;
  const lock = lockStatus(ROOT);
  console.log('아르카나 제작 조직' + (lock.locked ? ' · 총괄 잠금 있음' : ' · 실행 대기'));
  for (const goal of goals) {
    const tasks = board.tasks.filter((task) => task.goalId === goal.id);
    const counts = Object.fromEntries(['backlog', 'ready', 'active', 'review', 'done', 'blocked']
      .map((state) => [state, tasks.filter((task) => task.status === state).length]));
    console.log('\n' + goal.id + ' ' + goal.title + ' [' + goal.status + ', ' + goal.approval.status + ']');
    console.log('  작업: ' + Object.entries(counts).map(([state, count]) => state + ' ' + count).join(' / '));
    console.log('  계약 지문: ' + goalDigest(goal));
    for (const task of tasks) {
      const producer = resolveExecution(board, task, 'producer');
      const reviewer = resolveExecution(board, task, 'reviewer');
      console.log('  ' + task.id + ' [' + task.status + '] ' + task.title);
      console.log('    모델 설정 · 제작: ' + producer.model + '/' + producer.reasoningEffort + ' · 검토: ' + reviewer.model + '/' + reviewer.reasoningEffort);
      if (task.runtime?.blockReason) console.log('    보류: ' + task.runtime.blockReason);
    }
    for (const item of board.decisions.filter((item) => item.goalId === goal.id && item.status === 'pending')) {
      console.log('  판단 필요: ' + item.id + ' ' + item.title);
    }
  }
}

export function editBoard(args) {
  const id = args.goal ?? (args.task ? findTask(readBoard(ROOT), args.task).goalId : 'M0');
  const lock = acquireLock(ROOT, { owner: 'app-or-cli:' + args.command, goalId: id });
  try {
    const board = readBoard(ROOT);
    if (args.command === 'approve') {
      const goal = findGoal(board, required(args.goal, '--goal'));
      required(args.by, '--by');
      if (args.digest !== goalDigest(goal)) throw new Error('status에서 확인한 현재 계약 지문을 --digest로 지정해 주세요.');
      for (const item of board.decisions.filter((item) => item.goalId === goal.id && item.status === 'pending')) {
        if (item.blocking !== false) throw new Error('계약 결정이 남아 있습니다: ' + item.id + '. 먼저 사용자 판단을 원장에 반영해 주세요.');
      }
      goal.approval = { ...goal.approval, status: 'approved', approvedBy: args.by, approvedAt: now(), digest: goalDigest(goal) };
      goal.status = 'active';
      board.decisions.push({ id: 'APPROVAL-' + Date.now(), goalId: goal.id, status: 'resolved',
        title: '목표 제작 계약 승인', decidedBy: args.by, decidedAt: now(), digest: goal.approval.digest });
    } else if (args.command === 'accept') {
      const goal = findGoal(board, required(args.goal, '--goal'));
      assertGoal(board, goal);
      const tasks = board.tasks.filter((task) => task.goalId === goal.id);
      if (!tasks.length || tasks.some((task) => task.status !== 'done')) throw new Error('모든 작업의 독립 인수를 먼저 완료해 주세요.');
      if (board.requests.some((item) => item.goalId === goal.id && ['pending', 'escalated'].includes(item.status))
        || board.decisions.some((item) => item.goalId === goal.id && item.status === 'pending' && item.blocking !== false)) {
        throw new Error('목표에 남아 있는 요청·판단 사항을 먼저 해결해 주세요.');
      }
      goal.status = 'done';
      goal.acceptanceRecord = { acceptedBy: required(args.by, '--by'), acceptedAt: now(), note: required(args.reason, '--reason') };
    } else if (args.command === 'resolve_decision') {
      const decision = board.decisions.find((item) => item.id === required(args.decisionId, 'decisionId'));
      if (!decision || decision.goalId !== args.goal || decision.status !== 'pending') throw new Error('현재 목표의 대기 중인 판단 사항을 확인해 주세요.');
      decision.status = 'resolved';
      decision.resolution = required(args.reason, '판단 내용');
      decision.decidedBy = required(args.by, '판단자');
      decision.decidedAt = now();
    } else if (args.command === 'retry') {
      const task = findTask(board, required(args.task, '--task'));
      const reason = required(args.reason, '--reason');
      if (task.status !== 'blocked') throw new Error('blocked 작업만 재개할 수 있습니다.');
      if (reason === task.runtime?.lastRetryReason) throw new Error('같은 재개 사유를 반복할 수 없습니다. 달라진 전제를 구체적으로 기록해 주세요.');
      transitionTask(board, task.id, 'ready', { lastRetryReason: reason, blockReason: null,
        reviewPasses: 0, retryAuthorizedBy: required(args.by, '--by'), retryAuthorizedAt: now() });
    }
    writeBoard(ROOT, board);
    console.log('원장을 갱신했습니다: ' + args.command + ' ' + (args.goal ?? args.task));
  } finally {
    releaseLock(lock);
  }
}

function resultFile(task, key) {
  const value = required(task.runtime?.[key], task.id + '의 ' + key);
  if (!isWithinScope(value, ['.runtime/studio/runs'])) throw new Error('결과 경로가 실행 기록 밖입니다.');
  const target = path.resolve(ROOT, value);
  if (!fs.realpathSync(target).startsWith(fs.realpathSync(path.join(ROOT, '.runtime/studio/runs')) + path.sep)) {
    throw new Error('결과의 실제 경로가 실행 기록 밖입니다.');
  }
  return target;
}

async function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, timeout: 5000 }, () => resolve()));
  } else {
    // The child is its own process group on POSIX; stop its command descendants as well.
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

function interruptionError() {
  const error = new Error('실행 시간 한도 또는 사용자 중단에 도달했습니다.');
  error.interrupted = true;
  return error;
}

function persistRunBoard(board) {
  try { writeBoard(ROOT, board); }
  catch (error) { error.fatal = true; throw error; }
}

async function invokeCodex({ prompt, schema, prefix, run, deadline, executable, mode, signal, execution }) {
  const remaining = deadline - Date.now();
  if (remaining <= 0 || signal.aborted) throw interruptionError();
  const output = path.join(run.dir, prefix + '.json');
  let events;
  let errors;
  let child;
  let timer;
  let stopped = false;
  let rejectRunning;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (child) void stopTree(child);
    rejectRunning?.(interruptionError());
  };
  try {
    fs.writeFileSync(path.join(run.dir, prefix + '.prompt.txt'), prompt, { encoding: 'utf8', flag: 'wx' });
    fs.writeFileSync(path.join(run.dir, prefix + '.execution.json'), JSON.stringify(execution, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    events = fs.createWriteStream(path.join(run.dir, prefix + '.events.jsonl'), { flags: 'wx' });
    errors = fs.createWriteStream(path.join(run.dir, prefix + '.stderr.log'), { flags: 'wx' });
    await new Promise((resolve, reject) => {
      rejectRunning = reject;
      const infrastructureFailure = (error) => {
        error.fatal = true;
        if (child) void stopTree(child);
        reject(error);
      };
      events.on('error', infrastructureFailure);
      errors.on('error', infrastructureFailure);
      try {
        child = spawn(executable, ['exec', ...codexModelArgs(execution), '--cd', ROOT, '--sandbox', mode,
          '--config', 'approval_policy="never"', '--config', 'agents.max_threads=1',
          '--json', '--output-schema', path.join(DIRECTORY, schema), '--output-last-message', output, '-'],
        { cwd: ROOT, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        error.executionFailure = true;
        reject(error);
        return;
      }
      child.stdout.pipe(events);
      child.stderr.pipe(errors);
      child.once('error', (error) => {
        if (stopped) reject(interruptionError());
        else { error.executionFailure = true; reject(error); }
      });
      child.once('close', (code) => {
        if (stopped) reject(interruptionError());
        else if (code === 0) resolve();
        else {
          const error = new Error('Codex 실행 종료 코드: ' + code);
          error.executionFailure = true;
          reject(error);
        }
      });
      timer = setTimeout(stop, remaining);
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
    });
  } catch (error) {
    // 실행 기록 자체를 만들 수 없으면 조직 전체의 저장 기반이 깨진 상태입니다.
    if (!child && !error.interrupted && !error.executionFailure) error.fatal = true;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    // 로그 오류가 먼저 발생해도 편집 중인 자식이 남은 채 잠금을 반환하지 않습니다.
    if (child && child.exitCode === null && child.signalCode === null) {
      await stopTree(child);
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve) => {
          const cleanupTimer = setTimeout(() => {
            try {
              if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
              else child.kill('SIGKILL');
            } catch { /* 종료 경쟁에서는 기존 오류를 유지합니다. */ }
            resolve();
          }, 5000);
          child.once('close', () => { clearTimeout(cleanupTimer); resolve(); });
        });
      }
    }
    if (events && !events.destroyed) events.end();
    if (errors && !errors.destroyed) errors.end();
  }
  return { result: readJson(output), path: relative(output) };
}

function importRequests(board, task, result) {
  for (const request of result.requests) {
    const id = task.id + '-REQ-' + (board.requests.filter((item) => item.sourceTaskId === task.id).length + 1);
    board.requests.push({ ...request, id, sourceTaskId: task.id, goalId: task.goalId,
      status: 'pending', createdAt: now() });
  }
}

function unblockDependencies(board, goalId) {
  for (const task of board.tasks.filter((item) => item.goalId === goalId && item.status === 'blocked'
    && item.runtime?.blockKind === 'dependency-request')) {
    const requests = board.requests.filter((item) => item.sourceTaskId === task.id && item.blocking);
    if (requests.length && requests.every((item) => item.status === 'accepted')
      && task.dependsOn.every((id) => findTask(board, id).status === 'done')) {
      transitionTask(board, task.id, 'ready', { blockReason: null, lastRetryReason: '승인된 조직 간 선행 작업 완료' });
    }
  }
}

async function direct(board, goal, context) {
  const pending = board.requests.filter((item) => item.goalId === goal.id && item.status === 'pending');
  if (!pending.length) return;
  const response = await (context.invoke ?? invokeCodex)({ ...context, task: null, phase: 'director', goalId: goal.id, execution: resolveExecution(board, null, 'director'), mode: 'read-only', schema: 'director.schema.json',
    prefix: 'director-' + context.sequence, prompt: formatDirectorPrompt(board, goal.id) });
  const result = validateDirectorResult(response.result, { goalId: goal.id, requestIds: pending.map((item) => item.id) });
  for (const decision of result.decisions) {
    const request = board.requests.find((item) => item.id === decision.requestId);
    if (decision.action === 'accept') {
      const candidate = structuredClone(board);
      const source = findTask(candidate, request.sourceTaskId);
      const task = {
        id: request.id + '-TASK', goalId: goal.id, title: request.title, playerChange: request.playerChange,
        organization: request.organization, status: 'ready', priority: source.priority,
        dependsOn: request.dependsOn, scope: request.scope, capabilities: request.capabilities,
        checks: request.checks, surface: request.surface, acceptance: request.acceptance, runtime: {},
      };
      try {
        if (candidate.tasks.length >= 200) throw new Error('작업 원장의 초기 상한 200개에 도달했습니다.');
        assertTaskAuthorized(candidate, task, { surface: request.surface });
        if (request.blocking) {
          if (task.dependsOn.includes(source.id)) throw new Error('차단 요청이 원래 작업을 선행 조건으로 가질 수 없습니다.');
          source.dependsOn.push(task.id);
        }
        candidate.tasks.push(task);
        validateBoard(candidate);
        board.tasks = candidate.tasks;
        request.status = 'accepted';
        request.taskId = task.id;
      } catch (error) {
        request.status = 'escalated';
        decision.reason += ' / 자동 반영 불가: ' + error.message;
      }
    } else {
      request.status = decision.action === 'defer' ? 'deferred' : 'escalated';
    }
    request.directorReason = decision.reason;
    request.directorResultPath = response.path;
    if (request.status === 'escalated') {
      board.decisions.push({ id: request.id + '-DECISION', goalId: goal.id, status: 'pending', blocking: true,
        title: request.title, recommendation: decision.reason, sourceRequestId: request.id });
    }
  }
  if (result.decisions.length === 0) {
    for (const request of pending) {
      request.status = 'escalated';
      board.decisions.push({ id: request.id + '-DECISION', goalId: goal.id, status: 'pending', blocking: true,
        title: request.title, recommendation: '총괄이 요청을 배정하지 못했습니다. ' + result.summary });
    }
  }
  persistRunBoard(board);
}

export async function run(args, hooks = {}) {
  const goalId = required(args.goal, '--goal');
  const lock = acquireLock(ROOT, { owner: hooks.owner ?? 'cli-director', goalId });
  let cancel;
  let runInfo;
  let board;
  let current = null;
  try {
    // 잠금을 얻기 전에 읽은 원장은 다른 총괄의 최신 상태를 덮어쓸 수 있습니다.
    board = readBoard(ROOT);
    const goal = findGoal(board, goalId);
    assertGoal(board, goal);
    if (goal.status === 'done') { console.log('이미 인수한 목표입니다: ' + goal.id); return; }
    const appTask = board.tasks.find((task) => task.status === 'active' && task.runtime?.executionSurface === 'app');
    if (appTask) throw new Error('앱에서 진행 중인 작업을 먼저 인수해 주세요: ' + appTask.id);
    const minutes = Number(args.minutes ?? board.settings.defaultMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 90) throw new Error('--minutes는 0 초과 90 이하로 지정해 주세요.');
    const executable = args.codex ?? (process.platform === 'win32' ? 'codex.exe' : 'codex');
    try {
      execFileSync(executable, ['--version'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      error.fatal = true;
      error.message = 'Codex CLI를 시작할 수 없습니다. 실행 파일·설치를 확인해 주세요: ' + error.message;
      throw error;
    }
    const abort = new AbortController();
    cancel = () => abort.abort();
    hooks.signal?.addEventListener('abort', cancel, { once: true });
    if (hooks.signal?.aborted) cancel();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    runInfo = createRun(ROOT, goal.id);
    const context = { run: runInfo, deadline: Date.now() + minutes * 60000, executable, signal: abort.signal, invoke: hooks.invoke };
    const before = execFileSync('git', ['status', '--short'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(path.join(runInfo.dir, 'git-status-before.txt'), before, 'utf8');
    for (const task of board.tasks.filter((item) => item.goalId === goal.id && item.status === 'active')) {
      transitionTask(board, task.id, 'blocked', { blockKind: 'interrupted',
        blockReason: '이전 CLI 제작 실행이 중단되었습니다. 변경과 실행 기록을 확인한 뒤 달라진 전제를 retry에 기록해 주세요.' });
    }
    persistRunBoard(board);
    for (let sequence = 1; sequence <= 32 && Date.now() < context.deadline && !abort.signal.aborted; sequence += 1) {
      if (hooks.shouldPause?.()) break;
      if (hooks.onBoundary) {
        await hooks.onBoundary(board, goal);
        validateBoard(board);
        persistRunBoard(board);
      }
      try {
        await direct(board, goal, { ...context, sequence });
      } catch (error) {
        if (error.fatal) throw error;
        if (error.interrupted) break;
        const fingerprint = hash('director:' + goal.id + ':' + error.message);
        for (const request of board.requests.filter((item) => item.goalId === goal.id && item.status === 'pending')) {
          request.status = 'escalated';
          request.directorReason = '총괄 실행 결과를 인수하지 못했습니다: ' + error.message;
          request.failure = { fingerprint, conditionToRetry: '총괄 결과와 실행 환경을 확인하고 달라진 전제를 사용자 판단으로 기록해 주세요.' };
          const decisionId = request.id + '-DECISION';
          if (!board.decisions.some((item) => item.id === decisionId)) {
            board.decisions.push({ id: decisionId, goalId: goal.id, status: 'pending', blocking: true,
              title: request.title, recommendation: request.directorReason, sourceRequestId: request.id });
          }
        }
        persistRunBoard(board);
        console.error('총괄 요청 조정을 보류했습니다: ' + error.message);
        if (error.executionFailure) throw error;
      }
      unblockDependencies(board, goal.id);
      persistRunBoard(board);
      const task = selectTask(board, goal.id);
      if (!task) break;
      current = task;
      try {
        assertTaskAuthorized(board, task);
        let phase = task.status === 'review' ? 'reviewer' : 'producer';
        if (phase === 'producer') {
          if (task.status === 'backlog') transitionTask(board, task.id, 'ready');
          const baseline = captureBaseline(ROOT, runInfo, task);
          transitionTask(board, task.id, 'active', { attempt: (task.runtime?.attempt ?? 0) + 1,
            runId: runInfo.id, baselinePath: relative(baseline.manifestPath), blockReason: null, executionSurface: 'cli' });
          persistRunBoard(board);
          console.log(task.id + ' · ' + task.organization + ' 제작 중');
          const response = await (context.invoke ?? invokeCodex)({ ...context, task, phase, goalId: goal.id, execution: resolveExecution(board, task, phase), schema: 'result.schema.json', mode: task.scope.write.length ? 'workspace-write' : 'read-only',
            prefix: task.id + '-producer-' + sequence,
            prompt: formatTaskPrompt(board, task, phase, { runRelative: relative(runInfo.dir), baselineRelative: relative(baseline.manifestPath) }) });
          const result = validateResult(ROOT, response.result, { task, phase });
          importRequests(board, task, result);
          if (result.outcome !== 'completed') {
            transitionTask(board, task.id, 'blocked', {
              producerResultPath: response.path, failure: result.failure,
              blockKind: result.requests.some((item) => item.blocking) ? 'dependency-request' : 'worker', blockReason: result.summary,
            });
            persistRunBoard(board);
            current = null;
            continue;
          }
          transitionTask(board, task.id, 'review', { producerResultPath: response.path, producerSummary: result.summary });
          persistRunBoard(board);
          phase = 'reviewer';
        }
        const producerResult = validateResult(ROOT, readJson(resultFile(task, 'producerResultPath')), { task, phase: 'producer' });
        console.log(task.id + ' · 독립 품질 검토 중');
        const response = await (context.invoke ?? invokeCodex)({ ...context, task, phase, goalId: goal.id, execution: resolveExecution(board, task, phase), schema: 'result.schema.json', mode: 'read-only',
          prefix: task.id + '-reviewer-' + sequence,
          prompt: formatTaskPrompt(board, task, phase, { runRelative: relative(runInfo.dir), producerResult,
            baselineRelative: task.runtime.baselinePath }) });
        const result = validateResult(ROOT, response.result, { task, phase });
        const reviewPasses = (task.runtime.reviewPasses ?? 0) + 1;
        if (result.outcome === 'completed') {
          transitionTask(board, task.id, 'done', { reviewResultPath: response.path, reviewPasses,
            evidence: result.evidence.map((item) => item.path + ' — ' + item.claim), reviewSummary: result.summary, blockReason: null });
        } else if (result.outcome === 'needs_changes' && reviewPasses < board.settings.maxReviewPasses) {
          transitionTask(board, task.id, 'ready', { reviewPasses, lastReviewPath: response.path, repairInstructions: result.issues,
            lastFailure: result.failure, blockReason: null });
        } else {
          transitionTask(board, task.id, 'blocked', { reviewPasses, lastReviewPath: response.path,
            failure: result.failure, blockKind: 'review', blockReason: result.summary });
        }
        persistRunBoard(board);
        console.log(task.id + ' · ' + task.status + ' · ' + result.summary);
      } catch (error) {
        if (error.fatal) { error.taskId = task.id; throw error; }
        const failure = { fingerprint: hash(task.id + ':' + task.status + ':' + error.message),
          conditionToRetry: '실행 기록과 부분 변경을 확인하고 실패 전제가 달라진 이유를 기록해 주세요.' };
        if (task.status === 'review' && error.interrupted) {
          task.runtime = { ...task.runtime, reviewInterrupted: error.message, updatedAt: now() };
        } else if (['backlog', 'ready', 'active', 'review'].includes(task.status)) {
          transitionTask(board, task.id, 'blocked', { blockKind: error.interrupted ? 'interrupted' : task.surface === 'app' ? 'app' : 'execution',
            blockReason: error.message, failure });
        }
        persistRunBoard(board);
        console.error(task.id + ' · 보류 · ' + error.message);
        if (error.executionFailure) { error.taskId = task.id; throw error; }
        if (error.interrupted) break;
      } finally {
        current = null;
      }
    }
    const tasks = board.tasks.filter((task) => task.goalId === goal.id);
    let message;
    if (tasks.length && tasks.every((task) => task.status === 'done')) message = '기술 작업의 독립 인수가 끝났습니다. 목표의 최종 사용자 인수를 기다립니다.';
    else if (abort.signal.aborted || Date.now() >= context.deadline) message = '실행 한도에서 상태를 저장했습니다. 다음 run에서 이어받습니다.';
    else message = '현재 가능한 작업을 마쳤습니다. 보류 작업·조직 간 요청·판단 사항을 status에서 확인해 주세요.';
    saveJson(path.join(runInfo.dir, 'summary.json'), { goalId: goal.id, finishedAt: now(), message,
      tasks: tasks.map((task) => ({ id: task.id, status: task.status, blockReason: task.runtime?.blockReason ?? null })) });
    console.log(message);
    console.log('실행 기록: ' + relative(runInfo.dir));
  } catch (error) {
    if (runInfo) {
      try { saveJson(path.join(runInfo.dir, 'failure.json'), { failedAt: now(), taskId: error.taskId ?? current?.id ?? null, error: error.message }); }
      catch { /* 저장 기반의 원래 오류를 유지합니다. */ }
    }
    throw error;
  } finally {
    if (cancel) {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      hooks.signal?.removeEventListener('abort', cancel);
    }
    releaseLock(lock);
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.command === 'help') {
    console.log('아르카나 Codex 제작 조직\n\n'
      + '  node scripts/studio/studio.mjs status [--goal M1]\n'
      + '  node scripts/studio/studio.mjs validate\n'
      + '  node scripts/studio/studio.mjs prompt --task DEMO-010 [--phase producer|reviewer] [--producer <실행상대JSON>]\n'
      + '  node scripts/studio/studio.mjs approve --goal M1 --by 사용자 --digest <계약지문>\n'
      + '  node scripts/studio/studio.mjs run --goal M1 [--minutes 90] [--codex <codex.exe>]\n'
      + '  node scripts/studio/studio.mjs retry --task <ID> --by 사용자 --reason <달라진전제>\n'
      + '  node scripts/studio/studio.mjs accept --goal M1 --by 사용자 --reason <인수근거>\n'
      + '  node scripts/studio/studio.mjs handoff --task <ID> --by 사용자\n'
      + '  node scripts/studio/studio.mjs report --task <ID> --by 사용자 --producer <실행상대JSON> --review <별도JSON>\n'
      + '  node scripts/studio/studio.mjs unlock\n\n'
      + '승인·재개·최종 인수는 사용자 판단을 기록하는 명령입니다. 작업 에이전트가 임의로 실행하지 않습니다.');
  } else if (args.command === 'status') status(readBoard(ROOT), args);
  else if (args.command === 'validate') { readBoard(ROOT); console.log('원장 구조·경로·의존성의 정적 검사를 통과했습니다.'); }
  else if (args.command === 'prompt') {
    const board = readBoard(ROOT);
    const phase = args.phase ?? 'producer';
    if (!['producer', 'reviewer'].includes(phase)) throw new Error('--phase는 producer 또는 reviewer여야 합니다.');
    const task = findTask(board, required(args.task, '--task'));
    assertGoal(board, findGoal(board, task.goalId));
    assertTaskAuthorized(board, task, { surface: 'app' });
    let producerResult = null;
    let producerPath = null;
    if (phase === 'reviewer') {
      producerPath = resultFile({ id: task.id, runtime: { producerResultPath: args.producer ?? task.runtime?.producerResultPath } }, 'producerResultPath');
      producerResult = validateResult(ROOT, readJson(producerPath), { task, phase: 'producer' });
      if (producerResult.outcome !== 'completed') throw new Error('완료된 제작 결과만 독립 검토에 넘길 수 있습니다.');
    } else if (args.producer) throw new Error('--producer는 reviewer 프롬프트에만 사용할 수 있습니다.');
    console.log(formatTaskPrompt(board, task, phase, { producerResult,
      runRelative: producerPath ? relative(path.dirname(producerPath)) : null, baselineRelative: task.runtime?.baselinePath ?? null }));
  } else if (['handoff', 'report'].includes(args.command)) await handleAppCommand(ROOT, args);
  else if (['approve', 'retry', 'accept'].includes(args.command)) editBoard(args);
  else if (args.command === 'run') await run(args);
  else if (args.command === 'unlock') console.log(clearStaleLock(ROOT) ? '종료된 실행의 잠금을 해제했습니다.' : '해제할 잠금이 없습니다.');
  else throw new Error('알 수 없는 명령입니다. help를 확인해 주세요.');
}

if (process.argv[1] && path.relative(path.dirname(fileURLToPath(import.meta.url)), path.resolve(process.argv[1])) === 'studio.mjs') {
  main().catch((error) => { console.error('제작 조직: ' + error.message); process.exitCode = 1; });
}
