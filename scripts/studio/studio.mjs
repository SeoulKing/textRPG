import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { handleAppCommand } from './app.mjs';
import { CodexClient, probeLocalProductionRoute } from './codex-client.mjs';
import { recordCollaboration, recordTaskHandoffs, collaborationEvidence, buildTaskHandoff } from './collaboration.mjs';
import { resolveExecution, codexModelArgs } from './model-policy.mjs';
import { buildCompletionPrompt, beginCompletionReview, normalizeCompletionDecision, applyCompletionDecision, failCompletionReview, retryCompletionReview } from './completion-director.mjs';
import {
  readBoard, writeBoard, validateBoard, findGoal, findTask, selectTaskBatch, transitionTask,
  acquireLock, releaseLock, lockStatus, clearStaleLock, createRun, captureBaseline, isWithinScope,
} from './engine.mjs';
import {
  assertTaskAuthorized, validateResult, validateDirectorResult, formatTaskPrompt, formatDirectorPrompt, collectTaskImages, collectCompletionImages, applyEditorLock,
  approvalDigest as goalDigest, assertGoalReady as assertGoal,
} from './protocol.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const relative = (value) => path.relative(ROOT, value).split(path.sep).join('/');
const now = () => new Date().toISOString();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
const saveJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', 'utf8');

function withImageNames(prompt, imageEvidence) {
  if (!imageEvidence.length) return prompt;
  return prompt + '\n\n실제 첨부 사진 순서\n' + imageEvidence.map((entry, index) => (index + 1) + '. ' + entry.path).join('\n');
}

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
      const reports = (board.completionReports ?? []).filter((report) => report.goalId === goal.id);
      if (reports.length && (reports.some((report) => ['pending', 'processing', 'blocked'].includes(report.status)) || goal.supervision?.status !== 'ready_for_acceptance')) {
        throw new Error('완료 보고에 대한 총괄의 후속 배정·목표 전체 확인을 먼저 마쳐 주세요.');
      }
      goal.status = 'done';
      goal.acceptanceRecord = { acceptedBy: required(args.by, '--by'), acceptedAt: now(), note: required(args.reason, '--reason') };
    } else if (args.command === 'resolve_decision') {
      let decision = board.decisions.find((item) => item.id === required(args.decisionId, 'decisionId'));
      if (!decision || decision.goalId !== args.goal || decision.status !== 'pending') throw new Error('현재 목표의 대기 중인 판단 사항을 확인해 주세요.');
      const reason = required(args.reason, '판단 내용');
      const by = required(args.by, '판단자');
      if (decision.sourceCompletionReportId) {
        Object.assign(board, retryCompletionReview(board, decision.sourceCompletionReportId, { reason, by, sourceCommandId: args.sourceCommandId ?? null }));
        decision = board.decisions.find((item) => item.id === args.decisionId);
      } else if (decision.type === 'app-handoff') {
        const task = findTask(board, decision.taskId);
        if (task.status === 'blocked' && task.runtime?.blockKind === 'app-handoff') {
          transitionTask(board, task.id, 'ready', { lastRetryReason: reason, retryAuthorizedBy: by, retryAuthorizedAt: now() });
        }
      } else if (decision.type === 'run-interruption') {
        const goal = findGoal(board, decision.goalId);
        if (goal.supervision?.blockingDecisionId === decision.id) {
          if (decision.previousSupervision) goal.supervision = decision.previousSupervision;
          else delete goal.supervision;
        }
        const task = board.tasks.find((item) => item.id === decision.taskId && item.goalId === goal.id);
        if (task?.status === 'blocked' && ['interrupted', 'execution'].includes(task.runtime?.blockKind)) {
          transitionTask(board, task.id, 'ready', { lastRetryReason: reason, retryAuthorizedBy: by, retryAuthorizedAt: now() });
        }
      }
      decision.status = 'resolved';
      decision.resolution = reason;
      decision.decidedBy = by;
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

function holdRun(board, goalId, reason, taskId = null) {
  const goal = findGoal(board, goalId);
  if (goal.studioWorkflow !== 'autonomous-v1' || goal.status === 'done' || goal.supervision?.status === 'blocked') return;
  const createdAt = now();
  const decision = { id: 'RUN-' + crypto.randomUUID(), goalId, taskId, type: 'run-interruption',
    title: '제작 실행 재개 판단', status: 'pending', blocking: true, recommendation: reason, createdAt,
    previousSupervision: goal.supervision ?? null };
  board.decisions.push(decision);
  goal.supervision = { ...goal.supervision, status: 'blocked', summary: reason, updatedAt: createdAt, blockingDecisionId: decision.id };
  persistRunBoard(board);
}

async function invokeCodex({ prompt, schema, prefix, run, deadline, executable, mode, signal, execution, images = [] }) {
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
        child = spawn(executable, ['exec', ...codexModelArgs(execution), ...images.flatMap((image) => ['--image', image]), '--cd', ROOT, '--sandbox', mode,
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
    const imported = { ...request, id, sourceTaskId: task.id, goalId: task.goalId, status: 'pending', createdAt: now() };
    board.requests.push(imported);
    const event = recordCollaboration(board, { goalId: task.goalId, kind: 'request_submitted', status: 'pending', taskId: task.id,
      requestId: id, fromDepartmentId: task.organization, toDepartmentId: 'director', title: '부서 협업 요청 · 총괄 배정 대기',
      summary: request.title, reason: request.playerChange });
    imported.sourceCommandIds = event.sourceCommandIds;
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
  recordCollaboration(board, { goalId: goal.id, kind: 'director_review_started', status: 'active',
    fromDepartmentId: null, toDepartmentId: 'director', title: '총괄 협업 요청 검토 준비',
    summary: `${pending.length}개 미배정 요청의 담당 부서·선행 관계를 확인합니다.` });
  persistRunBoard(board);
  const response = await (context.invoke ?? invokeCodex)({ ...context, task: null, phase: 'director', goalId: goal.id, studioWorkflow: goal.studioWorkflow, execution: resolveExecution(board, null, 'director', { models: context.models, goalId: goal.id }), mode: 'read-only', schema: 'director.schema.json',
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
        checks: request.checks, surface: request.surface, acceptance: request.acceptance, runtime: { sourceRequestId: request.id, sourceTaskId: request.sourceTaskId, sourceCommandIds: request.sourceCommandIds ?? [] },
      };
      if (goal.studioWorkflow === 'autonomous-v1') {
        if (request.productionMethod) task.productionMethod = request.productionMethod;
        if (request.visualStage) task.visualStage = request.visualStage;
        if (task.visualStage === 'final_capture' && goal.visualContract) {
          task.mainEntry = goal.visualContract.mainEntry;
          if (goal.visualContract.targetScene) task.targetScene = goal.visualContract.targetScene;
          task.scope = { ...task.scope, read: [...new Set([...task.scope.read, task.mainEntry, task.targetScene].filter(Boolean))] };
        }
        applyEditorLock(task);
      }
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
        recordCollaboration(board, { goalId: goal.id, kind: 'assigned', status: 'ready', taskId: task.id, relatedTaskId: request.sourceTaskId, requestId: request.id, fromDepartmentId: 'director', toDepartmentId: task.organization, title: '협업 요청을 담당 부서 작업으로 배정', summary: request.title, reason: decision.reason });
      } catch (error) {
        request.status = 'escalated';
        decision.reason += ' / 자동 반영 불가: ' + error.message;
      }
    } else {
      request.status = decision.action === 'defer' ? 'deferred' : 'escalated';
    }
    request.directorReason = decision.reason;
    request.directorResultPath = response.path;
    recordCollaboration(board, { goalId: goal.id, kind: 'director_assigned', status: request.status,
      taskId: request.taskId ?? request.sourceTaskId, relatedTaskId: request.taskId ? request.sourceTaskId : null,
      requestId: request.id, fromDepartmentId: 'director', toDepartmentId: request.status === 'accepted' ? request.organization : 'director',
      title: request.status === 'accepted' ? '총괄이 협업 작업을 배정' : request.status === 'deferred' ? '총괄이 협업 요청을 보류' : '추가 판단 요청 · 아직 미배정',
      summary: request.title, reason: decision.reason, evidence: [{ path: response.path, summary: '총괄 요청 조정 결과' }] });
    if (request.status === 'escalated') {
      board.decisions.push({ id: request.id + '-DECISION', goalId: goal.id, status: 'pending', blocking: true,
        title: request.title, recommendation: decision.reason, sourceRequestId: request.id });
    }
  }
  if (result.decisions.length === 0) {
    for (const request of pending) {
      request.status = 'escalated';
      recordCollaboration(board, { goalId: goal.id, kind: 'director_assigned', status: 'escalated', taskId: request.sourceTaskId, requestId: request.id, fromDepartmentId: 'director', toDepartmentId: 'director', title: '협업 요청 미배정 · 추가 판단 필요', summary: request.title, reason: result.summary });
      board.decisions.push({ id: request.id + '-DECISION', goalId: goal.id, status: 'pending', blocking: true,
        title: request.title, recommendation: '총괄이 요청을 배정하지 못했습니다. ' + result.summary });
    }
  }
  persistRunBoard(board);
}

// The caller holds the canonical board lock. Completion notification and director decisions are durable.
export async function superviseCompletions(board, goalId, context) {
  const hasBlocked = () => (board.completionReports ?? []).some((report) => report.goalId === goalId && report.status === 'blocked');
  if (hasBlocked()) return false;
  const unfinished = () => (board.completionReports ?? []).filter((report) => report.goalId === goalId && ['pending', 'processing'].includes(report.status));
  for (let count = 0; count < 32 && unfinished().length; count += 1) {
    if (context.signal?.aborted || Date.now() >= context.deadline || context.shouldPause?.()) return false;
    const report = unfinished()[0];
    if (report.status === 'processing') {
      Object.assign(board, failCompletionReview(board, report.id, new Error('이전 총괄 완료 확인이 처리 결과 없이 중단됐습니다. 기록과 달라진 전제를 확인해 주세요.')));
      persistRunBoard(board); return false;
    }
    let response;
    try {
      Object.assign(board, beginCompletionReview(board, report.id)); persistRunBoard(board);
      const { images, imageEvidence } = collectCompletionImages(ROOT, board, report.id);
      response = await (context.invoke ?? invokeCodex)({ ...context, task: null, phase: 'director', goalId, images,
        studioWorkflow: findGoal(board, goalId).studioWorkflow, execution: resolveExecution(board, null, 'director', { models: context.models, goalId }), mode: 'read-only', schema: 'completion-director.schema.json',
        prefix: report.id + '-director', prompt: withImageNames(buildCompletionPrompt(board, report.id), imageEvidence) });
      const patch = normalizeCompletionDecision(board, report.id, response.result, { imageEvidence });
      Object.assign(board, applyCompletionDecision(board, report.id, patch, { resultPath: response.path }));
      persistRunBoard(board);
      if (findGoal(board, goalId).supervision?.status === 'blocked') return false;
    } catch (error) {
      if (error.fatal) throw error;
      Object.assign(board, failCompletionReview(board, report.id, error, { resultPath: response?.path ?? null }));
      persistRunBoard(board);
      console.error('총괄 완료 확인을 보류했습니다: ' + error.message);
      if (error.executionFailure) throw error;
      return false;
    }
  }
  return !hasBlocked() && unfinished().length === 0 && findGoal(board, goalId).supervision?.status !== 'blocked';
}
function finishProducer(board, task, response, imageEvidence) {
  const result = validateResult(ROOT, response.result, { task, phase: 'producer', imageEvidence });
  recordTaskHandoffs(board, task, 'producer', { status: 'delivered' });
  const details = { pendingResultPath: null, producerResultPath: response.path,
    producerSummary: result.summary, producerEvidence: collaborationEvidence(result.evidence), producerImageEvidence: imageEvidence };
  importRequests(board, task, result);
  if (result.outcome === 'completed') transitionTask(board, task.id, 'review', details);
  else transitionTask(board, task.id, 'blocked', { ...details, failure: result.failure,
    blockKind: result.requests.some((item) => item.blocking) ? 'dependency-request' : 'worker', blockReason: result.summary });
  persistRunBoard(board);
}

function finishReview(board, task, response, producerResult, imageEvidence) {
  const result = validateResult(ROOT, response.result, { task, phase: 'reviewer', imageEvidence });
  recordTaskHandoffs(board, task, 'reviewer', { status: 'delivered', producerResult });
  const reviewPasses = (task.runtime.reviewPasses ?? 0) + 1;
  const reviewedImages = imageEvidence.filter((image) => result.evidence.some((item) => item.kind === 'visual' && item.path === image.path));
  const details = { pendingResultPath: null, reviewedImages, reviewPasses, reviewSummary: result.summary, reviewEvidence: collaborationEvidence(result.evidence) };
  if (result.outcome === 'completed') {
    transitionTask(board, task.id, 'done', { ...details, reviewResultPath: response.path,
      evidence: result.evidence.map((item) => item.path + ' — ' + item.claim), blockReason: null });
  } else if (result.outcome === 'needs_changes' && reviewPasses < board.settings.maxReviewPasses) {
    transitionTask(board, task.id, 'ready', { ...details, lastReviewPath: response.path, repairInstructions: result.issues, lastFailure: result.failure });
  } else {
    transitionTask(board, task.id, 'blocked', { ...details, lastReviewPath: response.path, failure: result.failure, blockKind: 'review', blockReason: result.summary });
  }
  persistRunBoard(board);
}

function taskFailure(board, task, error) {
  error.taskId = task.id;
  if (error.fatal) return;
  if (task.status === 'review' && error.interrupted) {
    task.runtime = { ...task.runtime, reviewInterrupted: error.message, updatedAt: now() };
  } else {
    const kind = error.interrupted ? 'interrupted' : task.surface === 'app' && !task.runtime?.productionRoute?.available ? 'app' : 'execution';
    transitionTask(board, task.id, 'blocked', { blockKind: kind, blockReason: error.message,
      failure: { fingerprint: hash(task.id + ':' + task.status + ':' + error.message),
        conditionToRetry: '부분 변경과 실행 기록을 확인하고, 달라진 전제에서 재개해 주세요.' } });
  }
  persistRunBoard(board);
  console.error(task.id + ' · 보류 · ' + error.message);
}

function submittedProducer(task) {
  return validateResult(ROOT, readJson(resultFile(task, 'producerResultPath')),
    { task, phase: 'producer', imageEvidence: task.runtime.producerImageEvidence ?? [] });
}

function recoverTasks(board, goal) {
  for (const task of board.tasks.filter((item) => item.goalId === goal.id && ['active', 'review'].includes(item.status))) {
    if (goal.studioWorkflow === 'autonomous-v1' && task.runtime?.pendingResultPath) {
      try {
        const result = readJson(resultFile(task, 'pendingResultPath'));
        const response = { result, path: task.runtime.pendingResultPath };
        if (task.status === 'active') finishProducer(board, task, response, task.runtime.pendingImageEvidence ?? []);
        else finishReview(board, task, response, submittedProducer(task), task.runtime.pendingImageEvidence ?? []);
        continue;
      } catch (error) { if (error.fatal) throw error; }
    }
    if (task.status === 'active') transitionTask(board, task.id, 'blocked', { blockKind: 'interrupted',
      blockReason: '이전 CLI 제작 결과를 인수하지 못했습니다. 부분 변경과 실행 기록을 확인한 뒤 재개해 주세요.' });
  }
  persistRunBoard(board);
}

async function prepareProducer(board, goal, task, context) {
  if (goal.studioWorkflow === 'autonomous-v1' && task.surface === 'app') {
    const probe = context.probeProductionRoute ?? ((item) => probeLocalProductionRoute(ROOT, item));
    task.runtime ??= {};
    task.runtime.productionRoute = await probe(task);
    const handoffs = board.decisions.filter((item) => item.goalId === goal.id && item.taskId === task.id && item.type === 'app-handoff');
    const waiting = handoffs.find((item) => item.status === 'pending');
    if (!task.runtime.productionRoute.available) {
      const reason = task.runtime.productionRoute.reason || '해당 편집기 세션을 사용할 수 있는지 확인해 주세요.';
      transitionTask(board, task.id, 'blocked', { blockKind: 'app-handoff', blockReason: reason });
      if (waiting) waiting.recommendation = reason;
      else board.decisions.push({ id: task.id + '-APP-DECISION' + (handoffs.length ? '-' + (handoffs.length + 1) : ''),
        type: 'app-handoff', goalId: goal.id, taskId: task.id, title: task.title + ' · 편집기 인계', status: 'pending', blocking: true, recommendation: reason });
      persistRunBoard(board);
      return null;
    }
    if (waiting) Object.assign(waiting, { status: 'resolved', decidedAt: now(), resolution: task.runtime.productionRoute.reason });
  }
  assertTaskAuthorized(board, task);
  const phase = 'producer';
  const prefix = task.id + '-producer-' + context.sequence;
  const { images, imageEvidence } = collectTaskImages(ROOT, board, task, phase);
  if (task.status === 'backlog') transitionTask(board, task.id, 'ready');
  const baseline = captureBaseline(ROOT, context.run, task);
  transitionTask(board, task.id, 'active', { attempt: (task.runtime?.attempt ?? 0) + 1, executionSurface: 'cli',
    runId: context.run.id, baselinePath: relative(baseline.manifestPath), blockReason: null,
    pendingResultPath: relative(path.join(context.run.dir, prefix + '.json')), pendingImageEvidence: imageEvidence });
  const handoff = buildTaskHandoff(board, task);
  recordTaskHandoffs(board, task, phase, { status: 'prepared' });
  persistRunBoard(board);
  console.log(task.id + ' · ' + task.organization + ' 제작 중');
  return { ...context, task, phase, prefix, images, imageEvidence, goalId: goal.id, studioWorkflow: goal.studioWorkflow,
    execution: resolveExecution(board, task, phase, { models: context.models }), schema: 'result.schema.json',
    mode: task.scope.write.length ? 'workspace-write' : 'read-only', prompt: withImageNames(formatTaskPrompt(board, task, phase,
      { runRelative: relative(context.run.dir), baselineRelative: relative(baseline.manifestPath), handoff }), imageEvidence) };
}

async function reviewTask(board, goal, task, context) {
  const manualVisualReview = goal.studioWorkflow === 'autonomous-v1' && task.status === 'review'
    && task.runtime.manualVisualReview && task.runtime.executionSurface === 'app';
  assertTaskAuthorized(board, task, { surface: manualVisualReview ? 'app' : 'cli' });
  const phase = 'reviewer';
  const producerResult = submittedProducer(task);
  const { images, imageEvidence } = collectTaskImages(ROOT, board, task, phase, producerResult);
  const prefix = task.id + '-reviewer-' + context.sequence;
  const handoff = buildTaskHandoff(board, task);
  recordCollaboration(board, { goalId: goal.id, kind: 'review_started', status: 'review', taskId: task.id,
    fromDepartmentId: task.organization, toDepartmentId: 'quality', title: '독립 품질 검토 실행 준비',
    summary: producerResult.summary, evidence: producerResult.evidence });
  recordTaskHandoffs(board, task, phase, { status: 'prepared', producerResult });
  Object.assign(task.runtime, { pendingResultPath: relative(path.join(context.run.dir, prefix + '.json')), pendingImageEvidence: imageEvidence });
  persistRunBoard(board);
  const response = await (context.invoke ?? invokeCodex)({ ...context, task, phase, prefix, images, producerResult, goalId: goal.id,
    studioWorkflow: goal.studioWorkflow, execution: resolveExecution(board, task, phase, { models: context.models }),
    schema: 'result.schema.json', mode: 'read-only', prompt: withImageNames(formatTaskPrompt(board, task, phase,
      { runRelative: relative(context.run.dir), producerResult, baselineRelative: task.runtime.baselinePath, handoff }), imageEvidence) });
  finishReview(board, task, response, producerResult, imageEvidence);
}

// Only model calls run concurrently. The director owns every transition and persists each accepted result.
async function runTaskBatch(board, goal, tasks, context) {
  const jobs = [];
  let stop;
  function failed(task, error) {
    taskFailure(board, task, error);
    if (error.fatal || error.executionFailure || error.interrupted) stop ??= error;
  }
  for (const task of tasks) {
    if (task.status === 'review') continue;
    try {
      const job = await prepareProducer(board, goal, task, context);
      if (job) jobs.push(job);
    } catch (error) { failed(task, error); if (stop) break; }
  }
  if (stop?.fatal) throw stop;
  const answers = await Promise.allSettled(jobs.map((job) => Promise.resolve().then(() => (context.invoke ?? invokeCodex)(job))));
  for (const [index, answer] of answers.entries()) {
    const job = jobs[index];
    try {
      if (answer.status === 'rejected') throw answer.reason;
      finishProducer(board, job.task, answer.value, job.imageEvidence);
    } catch (error) { failed(job.task, error); }
  }
  if (stop) throw stop;
  for (const task of tasks) {
    if (task.status !== 'review') continue;
    if (context.signal.aborted || Date.now() >= context.deadline || (goal.studioWorkflow === 'autonomous-v1' && context.shouldPause?.())) break;
    try { await reviewTask(board, goal, task, context); }
    catch (error) { failed(task, error); if (stop) throw stop; }
  }
}

export async function run(args, hooks = {}) {
  const goalId = required(args.goal, '--goal');
  const lock = acquireLock(ROOT, { owner: hooks.owner ?? 'cli-director', goalId });
  let cancel;
  let runInfo;
  let board;
  let abort;
  let started = false;
  let interruption;
  let selectionCount = 0;
  try {
    // 잠금을 얻기 전에 읽은 원장은 다른 총괄의 최신 상태를 덮어쓸 수 있습니다.
    board = readBoard(ROOT);
    let goal = findGoal(board, goalId);
    assertGoal(board, goal);
    if (goal.status === 'done') { console.log('이미 인수한 목표입니다: ' + goal.id); return; }
    const appTask = board.tasks.find((task) => task.status === 'active' && task.runtime?.executionSurface === 'app');
    if (appTask) throw new Error('앱에서 진행 중인 작업을 먼저 인수해 주세요: ' + appTask.id);
    const minutes = Number(args.minutes ?? board.settings.defaultMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 90) throw new Error('--minutes는 0 초과 90 이하로 지정해 주세요.');
    started = true;
    const executable = args.codex ?? (process.platform === 'win32' ? 'codex.exe' : 'codex');
    try {
      execFileSync(executable, ['--version'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      error.fatal = true;
      error.message = 'Codex CLI를 시작할 수 없습니다. 실행 파일·설치를 확인해 주세요: ' + error.message;
      throw error;
    }
    abort = new AbortController();
    cancel = () => abort.abort();
    hooks.signal?.addEventListener('abort', cancel, { once: true });
    if (hooks.signal?.aborted) cancel();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    runInfo = createRun(ROOT, goal.id);
    const context = { run: runInfo, deadline: Date.now() + minutes * 60000, executable, signal: abort.signal, invoke: hooks.invoke, shouldPause: hooks.shouldPause, models: hooks.models, probeProductionRoute: hooks.probeProductionRoute };
    const before = execFileSync('git', ['status', '--short'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(path.join(runInfo.dir, 'git-status-before.txt'), before, 'utf8');
    recoverTasks(board, goal);
    if (goal.studioWorkflow === 'autonomous-v1') {
      if (hooks.loadModels) await hooks.loadModels();
      else if (!context.models) {
        const account = new CodexClient({ root: ROOT, executable });
        try {
          await account.connect();
          context.models = account.models;
        } finally { await account.close(); }
      }
    }
    for (let sequence = 1; selectionCount < 32 && sequence <= 32 && Date.now() < context.deadline && !abort.signal.aborted; sequence += 1) {
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
        if (error.interrupted) { interruption = error; break; }
        const fingerprint = hash('director:' + goal.id + ':' + error.message);
        for (const request of board.requests.filter((item) => item.goalId === goal.id && item.status === 'pending')) {
          request.status = 'escalated';
          request.directorReason = '총괄 실행 결과를 인수하지 못했습니다: ' + error.message;
          recordCollaboration(board, { goalId: goal.id, kind: 'blocked', status: 'escalated', taskId: request.sourceTaskId, requestId: request.id, fromDepartmentId: 'director', toDepartmentId: 'director', title: '총괄 요청 조정 차단 · 미배정', summary: request.title, reason: request.directorReason });
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
      if (!await superviseCompletions(board, goalId, { ...context, sequence })) break;
      goal = findGoal(board, goalId);
      const batch = selectTaskBatch(board, goal.id, { root: ROOT, limit: 32 - selectionCount });
      if (!batch.length) break;
      selectionCount += batch.length;
      try { await runTaskBatch(board, goal, batch, { ...context, sequence }); }
      catch (error) { if (error.interrupted) { interruption = error; break; } throw error; }
    }
    // Account for the last task even when the task-selection cap was reached. Do not extend the run deadline.
    if (!abort.signal.aborted && Date.now() < context.deadline && !hooks.shouldPause?.()) {
      await superviseCompletions(board, goalId, { ...context, sequence: 'final' });
    }
    goal = findGoal(board, goalId);
    const tasks = board.tasks.filter((task) => task.goalId === goal.id);
    const pendingCompletions = (board.completionReports ?? []).filter((report) => report.goalId === goal.id && ['pending', 'processing'].includes(report.status));
    if (goal.studioWorkflow === 'autonomous-v1' && goal.status !== 'done' && !abort.signal.aborted && !hooks.shouldPause?.()) {
      const limits = Date.now() >= context.deadline ? '승인된 실행 시간 한도에 도달했습니다.'
        : selectionCount >= 32 && (tasks.some((task) => task.status !== 'done') || pendingCompletions.length) ? '한 실행의 작업 32개 한도에 도달했습니다.' : null;
      if (limits || interruption) holdRun(board, goalId, (limits ?? interruption.message) + ' 저장된 결과와 남은 작업을 확인한 후 다음 실행을 지시해 주세요.', interruption?.taskId);
    }
    let message;
    if (goal.status === 'done' && goal.studioWorkflow === 'autonomous-v1') message = '총괄이 목표를 최종 인수했습니다.';
    else if (goal.supervision?.status === 'ready_for_acceptance' && tasks.length && tasks.every((task) => task.status === 'done') && !pendingCompletions.length) message = '총괄이 목표 전체의 완료 조건과 제출 근거를 확인했습니다. 최종 사용자 인수를 기다립니다.';
    else if (goal.supervision?.status === 'blocked' || (board.completionReports ?? []).some((report) => report.goalId === goal.id && report.status === 'blocked')) message = '총괄 완료 확인이 보류됐습니다. 사유와 필요한 후속 판단을 처리 흐름에서 확인해 주세요.';
    else if (abort.signal.aborted || Date.now() >= context.deadline) message = '실행 한도에서 상태를 저장했습니다. 완료 보고와 남은 작업은 다음 run에서 이어받습니다.';
    else if (selectionCount >= 32 && tasks.some((task) => task.status !== 'done')) message = '이번 실행의 작업 선택 한도에서 상태를 저장했습니다. 총괄이 배정한 후속 작업은 다음 run에서 이어받습니다.';
    else if (tasks.length && tasks.every((task) => task.status === 'done')) message = '부서별 작업은 완료됐지만 목표 전체에 대한 총괄 확인이 아직 완료되지 않았습니다.';
    else message = '현재 실행 가능한 작업 처리를 마쳤습니다. 총괄의 후속 배정과 보류 사유를 처리 흐름에서 확인해 주세요.';
    const summary = { goalId: goal.id, finishedAt: now(), message, supervisionStatus: goal.supervision?.status ?? null,
      pendingCompletionReports: pendingCompletions.length,
      tasks: tasks.map((task) => ({ id: task.id, status: task.status, blockReason: task.runtime?.blockReason ?? null })) };
    saveJson(path.join(runInfo.dir, 'summary.json'), summary);
    console.log(message);
    console.log('실행 기록: ' + relative(runInfo.dir));
    return summary;
  } catch (error) {
    if (started && !abort?.signal.aborted && !hooks.shouldPause?.() && board?.goals.some((goal) => goal.id === goalId && goal.studioWorkflow === 'autonomous-v1')) {
      try {
        holdRun(readBoard(ROOT), goalId, '제작 실행이 중단되었습니다. ' + error.message + ' 실행 환경과 저장된 결과를 확인한 뒤 재개해 주세요.', error.taskId);
      } catch (recordError) { console.error('실행 중단 상태를 원장에 저장하지 못했습니다: ' + recordError.message); }
    }
    if (runInfo) {
      try { saveJson(path.join(runInfo.dir, 'failure.json'), { failedAt: now(), taskId: error.taskId ?? null, error: error.message }); }
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
