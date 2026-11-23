import crypto from 'node:crypto';

const DEPARTMENTS = new Set(['director', 'design', 'narrative', 'world', 'character', 'development', 'quality']);
const LIFECYCLE_KINDS = new Set(['assigned', 'started', 'submitted', 'review_started', 'rejected', 'completed', 'blocked']);
const clean = (value, max = 1000) => typeof value === 'string' ? value.replace(/(?:Bearer\s+|sk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*)\S+/giu, '[비밀 정보 제외]').slice(0, max) : '';
const unique = (items) => [...new Set(items.filter((item) => typeof item === 'string' && item.trim()))];
const department = (value) => DEPARTMENTS.has(value) ? value : null;
const stamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

function evidencePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /[\x00-\x1f\x7f:*?"<>|]/u.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/u.test(part))) return null;
  const lower = parts.map((part) => part.toLowerCase());
  if (lower.some((part) => ['.git', '.aws', '.codex', 'node_modules', '.godot', '.server-dist', '__pycache__'].includes(part)
    || part === '.env' || (part.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(part)))) return null;
  if (lower[0] === '.runtime' && (lower[1] !== 'studio' || lower[2] !== 'runs')) return null;
  // Raw tool streams, stderr and reasoning traces are not collaboration evidence.
  const file = lower.at(-1);
  if (/\.(?:jsonl|log)$/u.test(file) || /(?:^|[-_.])(?:events|stderr|stdout|trace|rollout|reasoning|raw)(?:[-_.]|$)/u.test(file)
    || file === 'git-status-before.txt' || file.endsWith('.prompt.txt')) return null;
  return normalized;
}

export function collaborationEvidence(values = []) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const split = typeof value === 'string' ? value.split(' — ') : null;
    const path = evidencePath(split ? split[0] : value?.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push({ path, summary: clean(split ? split.slice(1).join(' — ') : value.summary ?? value.claim, 480) });
  }
  return result;
}

function sourceIds(board, { goalId, taskId = null, requestId = null, relatedTaskId = null, sourceCommandIds = [] }) {
  const ids = [...sourceCommandIds];
  const visited = new Set();
  const addGoal = (id) => {
    const goal = board.goals.find((item) => item.id === id);
    ids.push(goal?.sourceInstruction?.commandId, goal?.sourceCommandId, ...(goal?.sourceCommandIds ?? []));
  };
  const visit = (id) => {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const task = board.tasks.find((item) => item.id === id);
    if (!task) return;
    addGoal(task.goalId);
    ids.push(task.runtime?.sourceCommandId, task.runtime?.sourceInstruction?.commandId, ...(task.runtime?.sourceCommandIds ?? []));
    for (const dependency of task.dependsOn ?? []) visit(dependency);
    for (const request of board.requests.filter((item) => item.taskId === id || item.id === task.runtime?.sourceRequestId)) {
      ids.push(...(request.sourceCommandIds ?? []));
      visit(request.sourceTaskId);
    }
    visit(task.runtime?.sourceTaskId);
  };
  addGoal(goalId);
  visit(taskId);
  visit(relatedTaskId);
  if (requestId) {
    const request = board.requests.find((item) => item.id === requestId);
    if (request) {
      ids.push(...(request.sourceCommandIds ?? []));
      visit(request.sourceTaskId);
      visit(request.taskId);
    }
  }
  return unique(ids);
}

export function recordCollaboration(board, event) {
  if (!event || typeof event !== 'object' || !board.goals.some((goal) => goal.id === event.goalId)) throw new Error('협업 이벤트의 실제 목표가 필요합니다.');
  if (typeof event.kind !== 'string' || !event.kind.trim()) throw new Error('협업 이벤트 종류가 필요합니다.');
  if (event.taskId && !board.tasks.some((task) => task.id === event.taskId)) throw new Error('협업 이벤트의 작업이 원장에 없습니다.');
  const primaryTask = board.tasks.find((task) => task.id === event.taskId);
  if (primaryTask && primaryTask.goalId !== event.goalId) throw new Error('협업 이벤트의 작업은 해당 목표에 속해야 합니다.');
  const primaryRequest = board.requests.find((request) => request.id === event.requestId);
  if (event.requestId && (!primaryRequest || primaryRequest.goalId !== event.goalId)) throw new Error('협업 이벤트의 요청은 해당 목표에 속해야 합니다.');
  board.collaborationEvents ??= [];
  const id = event.id ?? 'COLLAB-' + crypto.randomUUID();
  const previous = board.collaborationEvents.find((item) => item.id === id);
  if (previous) return previous;
  const task = board.tasks.find((item) => item.id === event.taskId);
  const stored = {
    id, goalId: event.goalId, kind: event.kind, status: clean(event.status ?? task?.status ?? 'recorded', 48),
    at: stamp(event.at) ?? new Date().toISOString(), fromDepartmentId: department(event.fromDepartmentId),
    toDepartmentId: department(event.toDepartmentId), taskId: event.taskId ?? null, relatedTaskId: event.relatedTaskId ?? null,
    requestId: event.requestId ?? null, title: clean(event.title ?? task?.title ?? event.kind, 240),
    summary: clean(event.summary, 1200), reason: clean(event.reason, 800), evidence: collaborationEvidence(event.evidence),
    sourceCommandIds: sourceIds(board, event), provenance: 'recorded',
  };
  board.collaborationEvents.push(stored);
  return stored;
}

export function validateCollaborationEvents(board) {
  if (board.collaborationEvents === undefined) return;
  if (!Array.isArray(board.collaborationEvents)) throw new Error('collaborationEvents는 배열이어야 합니다.');
  const ids = new Set();
  for (const event of board.collaborationEvents) {
    if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !event.id.trim() || ids.has(event.id)
      || !board.goals.some((goal) => goal.id === event.goalId) || typeof event.kind !== 'string' || !event.kind.trim()
      || !stamp(event.at) || event.provenance !== 'recorded' || !Array.isArray(event.evidence)
      || !Array.isArray(event.sourceCommandIds) || event.sourceCommandIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new Error('내구 협업 이벤트의 형식·목표·중복 ID를 확인해 주세요.');
    }
    ids.add(event.id);
    const primaryTask = board.tasks.find((task) => task.id === event.taskId);
    const primaryRequest = board.requests.find((request) => request.id === event.requestId);
    if ((primaryTask && primaryTask.goalId !== event.goalId) || (primaryRequest && primaryRequest.goalId !== event.goalId)) throw new Error('협업 이벤트의 주 작업·요청은 해당 목표에 속해야 합니다.');
    for (const field of ['status', 'title', 'summary', 'reason']) if (typeof event[field] !== 'string') throw new Error('협업 이벤트 문자열 필드를 확인해 주세요: ' + field);
    for (const field of ['fromDepartmentId', 'toDepartmentId']) if (event[field] !== null && !DEPARTMENTS.has(event[field])) throw new Error('협업 이벤트 부서를 확인해 주세요.');
    for (const field of ['taskId', 'relatedTaskId']) if (event[field] !== null && !board.tasks.some((task) => task.id === event[field])) throw new Error('협업 이벤트 작업 참조를 확인해 주세요.');
    if (event.requestId !== null && !board.requests.some((request) => request.id === event.requestId)) throw new Error('협업 이벤트 요청 참조를 확인해 주세요.');
    if (event.evidence.some((item) => !item || evidencePath(item.path) !== item.path || typeof item.summary !== 'string')) throw new Error('협업 이벤트에 안전한 제출 증거만 남겨 주세요.');
  }
}

function resultOf(task) {
  const runtime = task.runtime ?? {};
  return {
    taskId: task.id, departmentId: task.organization, title: clean(task.title, 240), status: task.status,
    summary: clean(runtime.producerSummary), reviewSummary: clean(runtime.reviewSummary),
    evidence: collaborationEvidence([...(runtime.producerEvidence ?? []), ...(runtime.reviewEvidence ?? []), ...(runtime.evidence ?? []),
      ...(runtime.producerResultPath ? [{ path: runtime.producerResultPath, summary: '제작 결과 보고' }] : []),
      ...(runtime.reviewResultPath ? [{ path: runtime.reviewResultPath, summary: '독립 검토 보고' }] : [])]),
  };
}

/** This is the exact structured context included in the next department's prompt. */
export function buildTaskHandoff(board, task) {
  const requestIds = new Set([task.runtime?.sourceRequestId, ...board.requests.filter((request) => request.taskId === task.id || request.sourceTaskId === task.id).map((request) => request.id)]);
  return {
    version: 1, taskId: task.id, sourceCommandIds: sourceIds(board, { goalId: task.goalId, taskId: task.id }),
    dependencies: (task.dependsOn ?? []).map((id) => board.tasks.find((item) => item.id === id)).filter(Boolean).map(resultOf),
    requests: board.requests.filter((request) => requestIds.has(request.id)).map((request) => {
      const source = board.tasks.find((item) => item.id === request.sourceTaskId);
      return { requestId: request.id, status: request.status, sourceTaskId: request.sourceTaskId, taskId: request.taskId ?? null,
        organization: request.organization, blocking: request.blocking === true, title: clean(request.title, 240),
        reason: clean(request.playerChange), directorReason: clean(request.directorReason), sourceResult: source ? resultOf(source) : null };
    }),
  };
}

/** prepared records inclusion in an execution request; delivered requires a returned response. */
export function recordTaskHandoffs(board, task, phase, { status = 'prepared', producerResult = null } = {}) {
  if (!['prepared', 'delivered'].includes(status) || !['producer', 'reviewer'].includes(phase)) throw new Error('협업 인계 단계를 확인해 주세요.');
  const handoff = buildTaskHandoff(board, task);
  const to = phase === 'reviewer' ? 'quality' : task.organization;
  const sources = new Map(handoff.dependencies.map((item) => [item.taskId, item]));
  for (const request of handoff.requests) if (request.taskId === task.id && request.sourceResult) sources.set(request.sourceResult.taskId, request.sourceResult);
  if (phase === 'reviewer' && producerResult) sources.set(task.id, {
    taskId: task.id, departmentId: task.organization, title: task.title, summary: producerResult.summary,
    reviewSummary: '', evidence: collaborationEvidence(producerResult.evidence),
  });
  return [...sources.values()].map((source) => recordCollaboration(board, {
    goalId: task.goalId, kind: 'handoff', status, fromDepartmentId: source.departmentId, toDepartmentId: to,
    taskId: task.id, relatedTaskId: source.taskId,
    title: status === 'prepared' ? '선행 결과를 실행 프롬프트에 포함' : '선행 결과를 포함한 실행의 응답 수신',
    summary: [source.title, source.summary, source.reviewSummary].filter(Boolean).join(' · '),
    reason: status === 'prepared' ? '다음 담당자에게 보낼 프롬프트에 제출 요약·근거·요청 이유를 넣었습니다. 수신·열람 완료를 뜻하지 않습니다.'
      : '해당 맥락을 포함한 실행 요청에서 응답을 받았습니다. 개별 근거 파일을 읽었다고 주장하지 않습니다.',
    evidence: source.evidence, sourceCommandIds: handoff.sourceCommandIds,
  }));
}

function step(event) {
  return { id: event.id, kind: event.kind, status: event.status, at: stamp(event.at), fromDepartmentId: department(event.fromDepartmentId),
    toDepartmentId: department(event.toDepartmentId), taskId: event.taskId ?? null, relatedTaskId: event.relatedTaskId ?? null,
    requestId: event.requestId ?? null, title: clean(event.title, 180), summary: clean(event.summary, 480), reason: clean(event.reason, 240),
    evidence: collaborationEvidence(event.evidence).filter((item) => item.path.length <= 320).slice(0, 3).map((item) => ({ path: item.path, summary: clean(item.summary, 160) })), sourceCommandIds: unique(event.sourceCommandIds ?? []), provenance: event.provenance };
}

/** Only a new independently accepted done transition may create this report. */
export function recordTaskCompletion(board, task, { at = new Date().toISOString() } = {}) {
  if (task.status !== 'done' || !task.runtime?.reviewResultPath) throw new Error('독립 검토를 통과한 실제 완료 작업만 총괄에게 보고할 수 있습니다.');
  board.completionReports ??= [];
  const id = 'COMPLETE-' + task.id;
  const previous = board.completionReports.find((report) => report.id === id);
  if (previous) return previous;
  const report = {
    id, goalId: task.goalId, taskId: task.id, status: 'pending', createdAt: at, startedAt: null, processedAt: null, attempts: 0,
    organization: task.organization, taskTitle: clean(task.title, 240), producerSummary: clean(task.runtime.producerSummary, 2000),
    reviewSummary: clean(task.runtime.reviewSummary, 2000),
    evidence: collaborationEvidence([...(task.runtime.producerEvidence ?? []), ...(task.runtime.reviewEvidence ?? []), ...(task.runtime.evidence ?? [])]),
    sourceCommandIds: sourceIds(board, { goalId: task.goalId, taskId: task.id }), decision: null, resultPath: null, failure: null,
  };
  board.completionReports.push(report);
  task.runtime.completionReportId = id;
  const goal = board.goals.find((item) => item.id === task.goalId);
  const blockedReport = board.completionReports.find((item) => item.goalId === task.goalId && item.status === 'blocked');
  if (!blockedReport) goal.supervision = { status: 'pending', reportId: id, summary: '부서 완료 보고를 총괄이 확인하고 후속 작업·목표 전체 조건을 판단해야 합니다.', updatedAt: at, nextTaskIds: [], acceptanceEvidence: [] };
  else if (goal.supervision?.status !== 'blocked') goal.supervision = { status: 'blocked', reportId: blockedReport.id, summary: blockedReport.decision?.blockedReason ?? '이전에 차단된 총괄 완료 보고의 명시적 재개가 필요합니다.', updatedAt: at, nextTaskIds: [], acceptanceEvidence: [] };
  recordCollaboration(board, { id: id + '-REPORTED', goalId: task.goalId, taskId: task.id, kind: 'completion_reported', status: 'pending',
    fromDepartmentId: task.organization, toDepartmentId: 'director', title: '독립 검토를 통과한 부서 완료 결과를 총괄에 보고',
    summary: report.producerSummary, reason: report.reviewSummary || '독립 검토 완료 근거를 포함한 보고이며 총괄 확인은 아직 대기 중입니다.',
    evidence: report.evidence, sourceCommandIds: report.sourceCommandIds, at });
  return report;
}

export function validateCompletionReports(board) {
  if (board.completionReports === undefined) return;
  if (!Array.isArray(board.completionReports)) throw new Error('completionReports는 배열이어야 합니다.');
  const ids = new Set();
  for (const report of board.completionReports) {
    const task = board.tasks.find((item) => item.id === report?.taskId);
    if (!report || !task || task.status !== 'done' || task.goalId !== report.goalId || report.id !== 'COMPLETE-' + task.id || ids.has(report.id)
      || !['pending', 'processing', 'processed', 'blocked'].includes(report.status) || !stamp(report.createdAt)
      || !Number.isInteger(report.attempts) || report.attempts < 0 || report.attempts > 1
      || (report.status === 'pending' ? report.attempts !== 0 : report.attempts !== 1)
      || !Array.isArray(report.sourceCommandIds) || report.sourceCommandIds.some((id) => typeof id !== 'string' || !id.trim())
      || !Array.isArray(report.evidence) || report.evidence.some((item) => !item || evidencePath(item.path) !== item.path || typeof item.summary !== 'string')) {
      throw new Error('완료 보고의 실제 작업·중복·상태·시도 한도를 확인해 주세요.');
    }
    ids.add(report.id);
    for (const field of ['organization', 'taskTitle', 'producerSummary', 'reviewSummary']) if (typeof report[field] !== 'string') throw new Error('완료 보고의 제출 요약이 필요합니다.');
    if (report.organization !== task.organization) throw new Error('완료 보고의 담당 부서가 실제 작업과 다릅니다.');
    if (report.status === 'processing' && !stamp(report.startedAt)) throw new Error('총괄 검토 시작 시각이 필요합니다.');
    if (['processed', 'blocked'].includes(report.status) && !stamp(report.processedAt)) throw new Error('총괄 검토 처리 시각이 필요합니다.');
  }
}
function currentFor(board, goal, tasks) {
  const blockedReport = (board.completionReports ?? []).find((report) => report.goalId === goal.id && report.status === 'blocked');
  if (blockedReport) return { departmentId: 'director', taskId: blockedReport.taskId, title: '총괄 완료 조정 보류', reason: clean(blockedReport.decision?.blockedReason ?? goal.supervision?.summary) || '이전에 차단된 완료 보고가 있어 다른 보고와 다음 제작을 대기합니다.', status: 'blocked' };
  if (goal.supervision?.status === 'blocked') return { departmentId: 'director', taskId: null, title: '총괄 완료 조정 보류', reason: clean(goal.supervision.summary), status: 'blocked' };
  const waitingReport = (board.completionReports ?? []).find((report) => report.goalId === goal.id && ['pending', 'processing'].includes(report.status));
  if (waitingReport) return { departmentId: 'director', taskId: waitingReport.taskId, title: waitingReport.status === 'processing' ? '총괄이 부서 완료 보고를 확인하는 단계' : '부서 완료 보고 · 총괄 확인 대기', reason: '다음 제작 전에 총괄이 후속 배정과 목표 전체 완료 조건을 판단합니다.', status: waitingReport.status === 'processing' ? 'active' : 'pending' };
  const active = tasks.find((task) => task.status === 'active') ?? tasks.find((task) => task.status === 'review');
  if (active) return { departmentId: active.status === 'review' ? 'quality' : active.organization, taskId: active.id,
    title: active.title, reason: active.status === 'review' ? '제작 결과를 제출해 독립 검토 단계에 있습니다.' : '담당 부서의 작업이 진행 상태입니다.', status: active.status };
  const pending = board.requests.filter((request) => request.goalId === goal.id && (request.status ?? 'pending') === 'pending');
  if (pending.length) return { departmentId: 'director', taskId: pending[0].sourceTaskId ?? null, title: '협업 요청 배정 대기', reason: `${pending.length}개의 부서 요청이 아직 배정되지 않았습니다.`, status: 'waiting' };
  const done = new Set(board.tasks.filter((task) => task.status === 'done').map((task) => task.id));
  const ready = tasks.find((task) => ['ready', 'backlog'].includes(task.status) && task.dependsOn.every((id) => done.has(id)));
  if (ready) return { departmentId: ready.organization, taskId: ready.id, title: ready.title, reason: '선행 조건을 충족했으며 담당 부서 실행을 기다립니다.', status: 'ready' };
  const blocked = tasks.find((task) => task.status === 'blocked');
  if (blocked) return { departmentId: blocked.organization, taskId: blocked.id, title: blocked.title,
    reason: clean(blocked.runtime?.blockReason) || '이 작업은 차단 상태이며 완료되지 않았습니다.', status: 'blocked' };
  const waiting = tasks.find((task) => ['ready', 'backlog'].includes(task.status));
  if (waiting) return { departmentId: waiting.organization, taskId: waiting.id, title: waiting.title, reason: '선행 작업이 끝나기를 기다립니다.', status: 'waiting' };
  const unresolved = board.requests.find((request) => request.goalId === goal.id && request.status === 'escalated');
  if (unresolved) return { departmentId: 'director', taskId: unresolved.sourceTaskId ?? null, title: '미배정 요청 판단 대기', reason: clean(unresolved.directorReason) || '추가 판단이 필요한 부서 요청이 남아 있습니다.', status: 'blocked' };
  if (tasks.length && tasks.every((task) => task.status === 'done')) return { departmentId: null, taskId: null, title: goal.title,
    reason: goal.status === 'done' ? '목표가 최종 인수 상태입니다.' : goal.supervision?.status === 'ready_for_acceptance' ? '총괄이 목표 조건별 제출 근거를 확인했습니다. 최종 사용자 인수를 기다립니다.' : '현재 원장상 부서 작업은 완료됐지만 총괄의 목표 전체 확인 기록은 없습니다.', status: goal.status === 'done' ? 'done' : goal.supervision?.status === 'ready_for_acceptance' ? 'awaiting_acceptance' : 'pending' };
  return { departmentId: null, taskId: null, title: goal.title, reason: '배정된 작업의 실행 기록이 아직 없습니다.', status: 'planned' };
}

export function buildCollaborationSnapshot(board) {
  const events = board.collaborationEvents ?? [];
  return { version: 1, goals: board.goals.map((goal) => {
    const tasks = board.tasks.filter((task) => task.goalId === goal.id);
    const recorded = events.filter((event) => event.goalId === goal.id);
    const steps = recorded.map(step);
    for (const task of tasks) {
      if (recorded.some((event) => event.taskId === task.id && LIFECYCLE_KINDS.has(event.kind))) continue;
      steps.push({ id: 'LEGACY-' + task.id, kind: 'legacy_state', status: task.status, at: stamp(task.runtime?.updatedAt ?? task.updatedAt),
        fromDepartmentId: null, toDepartmentId: task.status === 'review' ? 'quality' : department(task.organization), taskId: task.id,
        relatedTaskId: null, requestId: null, title: '이전 원장 상태 · ' + clean(task.title, 220), summary: clean(task.runtime?.producerSummary ?? task.playerChange),
        reason: '협업 추적 이전의 원장 상태입니다. 실제 부서 간 전달 여부는 기록되지 않았습니다.', evidence: resultOf(task).evidence.slice(0, 8),
        sourceCommandIds: sourceIds(board, { goalId: goal.id, taskId: task.id }), provenance: 'legacy' });
    }
    for (const request of board.requests.filter((item) => item.goalId === goal.id && !recorded.some((event) => event.requestId === item.id))) {
      const source = board.tasks.find((task) => task.id === request.sourceTaskId);
      steps.push({ id: 'LEGACY-' + request.id, kind: 'request_submitted', status: request.status ?? 'pending', at: stamp(request.createdAt),
        fromDepartmentId: department(source?.organization), toDepartmentId: 'director', taskId: request.sourceTaskId ?? null,
        relatedTaskId: request.taskId ?? null, requestId: request.id, title: '이전 부서 요청 · ' + clean(request.title, 220),
        summary: clean(request.playerChange), reason: clean(request.directorReason) || '요청의 원장 상태만 확인되며 실제 전달 기록은 없습니다.', evidence: [],
        sourceCommandIds: sourceIds(board, { goalId: goal.id, requestId: request.id }), provenance: 'legacy' });
    }
    const links = [];
    const link = (source, target, kind, request = null) => {
      const latestHandoff = recorded.filter((event) => event.kind === 'handoff' && event.relatedTaskId === source.id && event.taskId === target.id
        && event.fromDepartmentId === source.organization && event.toDepartmentId === target.organization).at(-1);
      const sourceUpdatedAt = stamp(source.runtime?.updatedAt ?? source.updatedAt);
      const delivered = latestHandoff?.status === 'delivered' && (kind === 'request' || source.status === 'done')
        && (!sourceUpdatedAt || (latestHandoff.at && latestHandoff.at >= sourceUpdatedAt));
      const available = kind === 'request' ? request?.status === 'accepted' : source.status === 'done';
      links.push({ id: (request?.id ?? 'DEP-' + source.id + '-' + target.id), fromTaskId: source.id, toTaskId: target.id,
        fromDepartmentId: source.organization, toDepartmentId: target.organization, kind,
        status: delivered ? 'delivered' : available ? 'ready' : 'waiting',
        summary: request ? clean(request.directorReason ?? request.playerChange) : source.status === 'done' ? '선행 작업이 완료되었습니다. 실제 프롬프트 인계 기록은 별도로 표시합니다.' : '선행 작업 완료를 기다립니다.' });
    };
    for (const task of tasks) for (const id of task.dependsOn ?? []) {
      const source = board.tasks.find((item) => item.id === id);
      if (source) link(source, task, 'dependency');
    }
    for (const request of board.requests.filter((item) => item.goalId === goal.id && item.taskId)) {
      const source = board.tasks.find((task) => task.id === request.sourceTaskId);
      const target = board.tasks.find((task) => task.id === request.taskId);
      if (source && target) link(source, target, 'request', request);
    }
    return { goalId: goal.id, title: clean(goal.title, 240), instruction: clean(goal.sourceInstruction?.text, 12000),
      sourceCommandIds: unique([...sourceIds(board, { goalId: goal.id }), ...tasks.flatMap((task) => sourceIds(board, { goalId: goal.id, taskId: task.id })), ...recorded.flatMap((event) => event.sourceCommandIds)]),
      current: currentFor(board, goal, tasks), steps: steps.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).slice(-60).map((item) => step(item)), links: links.slice(0, 80), omittedStepCount: Math.max(0, steps.length - 60) };
  }) };
}