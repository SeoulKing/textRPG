import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ORGANIZATIONS, validateBoard, isWithinScope } from './engine.mjs';
import { assertGoalReady, assertTaskAuthorized, VISUAL_STAGES, applyEditorLock } from './protocol.mjs';
import { recordCollaboration, collaborationEvidence, buildTaskHandoff } from './collaboration.mjs';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('./completion-director.schema.json', import.meta.url), 'utf8'));
const FIELDS = ['reportId', 'goalId', 'action', 'summary', 'nextTaskIds', 'tasks', 'acceptanceEvidence', 'blockedReason'];
const TASK_FIELDS = ['localId', 'title', 'organization', 'playerChange', 'dependsOn', 'scope', 'capabilities', 'checks', 'acceptance', 'surface'];
const BROAD = new Set(['src', 'godot-arcana', 'docs', 'scripts', 'art-studies', 'assets', 'godot-web']);
const MAX_FOLLOW_UP_TASKS = 24;
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();

function fail(message) { throw new Error('총괄 완료 조정 계약: ' + message); }
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(label + '에 문자열이 필요합니다.');
  return value;
}
function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + '은 객체여야 합니다.');
  for (const key of fields) if (!Object.hasOwn(value, key)) fail(`${label}.${key}가 필요합니다.`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail(`${label}에 허용하지 않은 필드가 있습니다: ${key}`);
}
function strings(value, label, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(label + '은 문자열 배열이어야 합니다.');
  value.forEach((item) => text(item, label));
  if (new Set(value).size !== value.length) fail(label + '에 중복 항목이 있습니다.');
  return [...value];
}
function findReport(board, id) {
  const report = (board.completionReports ?? []).find((item) => item.id === id);
  if (!report) fail('실제 완료 보고가 없습니다: ' + id);
  return report;
}
function approvedGoal(board, report) {
  const goal = board.goals.find((item) => item.id === report.goalId);
  if (!goal || goal.status === 'done') fail('이미 인수했거나 없는 목표의 자동 완료 조정은 실행하지 않습니다.');
  assertGoalReady(board, goal);
  return goal;
}
function safePath(value, { write = false } = {}) {
  text(value, '작업 상대 경로');
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '');
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value) || /[\x00-\x1f\x7f:*?"<>|]/u.test(normalized)) fail('안전하지 않은 상대 경로입니다: ' + value);
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/u.test(part))) fail('모호한 상대 경로입니다: ' + value);
  const lower = parts.map((part) => part.toLowerCase());
  if (lower.some((part) => ['.git', '.aws', '.codex', 'node_modules', '.godot', '.server-dist', '__pycache__'].includes(part)
    || part === '.env' || (part.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(part)))) fail('기밀·캐시 경로는 후속 작업으로 사용할 수 없습니다.');
  if (lower[0] === '.runtime' && (write || lower[1] !== 'studio' || lower[2] !== 'runs')) fail('운영 경로는 실행 근거의 읽기에만 사용할 수 있습니다.');
  if (write && (BROAD.has(normalized.toLowerCase()) || isWithinScope('docs/studio/board.json', [normalized]) || isWithinScope(normalized, ['docs/studio/board.json']))) fail('후속 작업의 수정 범위를 실제 파일·하위 디렉터리로 좁혀 주세요.');
  return normalized;
}
function scope(value, label) {
  object(value, ['read', 'write'], label);
  const result = { read: strings(value.read, label + '.read').map((item) => safePath(item)),
    write: strings(value.write, label + '.write').map((item) => safePath(item, { write: true })) };
  for (const key of ['read', 'write']) {
    const keys = result[key].map((item) => process.platform === 'win32' ? item.toLowerCase() : item);
    if (new Set(keys).size !== keys.length) fail(label + '에 같은 경로가 중복되었습니다.');
  }
  return result;
}
function taskEvidence(task) {
  const runtime = task.runtime ?? {};
  return collaborationEvidence([...(runtime.producerEvidence ?? []), ...(runtime.reviewEvidence ?? []), ...(runtime.evidence ?? [])]);
}
function normalizePurpose(value) { return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase(); }
function samePurpose(left, right) {
  if (left.organization === right.organization && normalizePurpose(left.title) === normalizePurpose(right.title)) return true;
  return normalizePurpose(left.playerChange) === normalizePurpose(right.playerChange)
    && JSON.stringify(left.acceptance.map(normalizePurpose).sort()) === JSON.stringify(right.acceptance.map(normalizePurpose).sort());
}
function setSupervision(board, report, status, summary, { nextTaskIds = [], acceptanceEvidence = [] } = {}) {
  const goal = board.goals.find((item) => item.id === report.goalId);
  goal.supervision = { status, reportId: report.id, summary, nextTaskIds: [...nextTaskIds], acceptanceEvidence: structuredClone(acceptanceEvidence), updatedAt: now() };
}

function eventKey(report) { return report.id + ((report.retries?.length ?? 0) ? '-RETRY-' + report.retries.length : ''); }
function blockingDecision(board, report, recommendation) {
  if (board.decisions.some((item) => item.sourceCompletionReportId === report.id && item.status === 'pending')) return;
  board.decisions.push({ id: eventKey(report) + '-DECISION', goalId: report.goalId, sourceCompletionReportId: report.id,
    status: 'pending', blocking: true, title: '총괄 완료 조정 재개 판단', recommendation,
    context: '완료된 제작 작업은 다시 실행하지 않습니다. 달라진 전제와 사용자 명시 답변으로 해당 완료 보고만 재개할 수 있습니다.' });
}
export function createCompletionSchema() { return structuredClone(SCHEMA); }

export function buildCompletionPrompt(board, reportOrId) {
  const report = findReport(board, typeof reportOrId === 'string' ? reportOrId : reportOrId?.id);
  const goal = approvedGoal(board, report);
  const tasks = board.tasks.filter((task) => task.goalId === goal.id).map((task) => ({
    id: task.id, title: task.title, organization: task.organization, status: task.status, playerChange: task.playerChange,
    dependsOn: task.dependsOn, scope: task.scope, capabilities: task.capabilities, checks: task.checks ?? [], surface: task.surface ?? 'cli',
    acceptance: task.acceptance, producerSummary: task.runtime?.producerSummary ?? '', reviewSummary: task.runtime?.reviewSummary ?? '',
    evidence: taskEvidence(task), blockReason: task.runtime?.blockReason ?? null, blockKind: task.runtime?.blockKind ?? null,
  }));
  return [
    '아르카나 제작 총괄로서 독립 검토를 통과한 부서 완료 보고를 받아 목표 전체의 다음 진행을 결정해 주세요. 항상 존댓말로 답하세요.',
    '이번 보고는 자동 조정 기회가 한 번뿐입니다. 읽기 전용으로 실제 제출 요약·근거 파일·게임 연결·목표 acceptance를 확인하세요. 파일·원장·승인·게시 상태를 직접 수정하거나 추가 에이전트·모델을 실행하지 마세요. 테스트·브라우저·게임·빌드·내보내기·게시를 실행하지 마세요.',
    '한 부서의 완료를 목표 전체 완료로 바꾸지 마세요. 남은 구현, 부서 간 연결, 최종 통합 검토가 빠졌다면 승인된 범위 안에서 최소 후속 작업으로 배정하세요. 이미 끝난 동일 목적의 작업이나 같은 제목의 작업을 반복 배정하지 마세요.',
    'action:continue는 이미 원장에 존재하고 현재 선행 조건을 충족한 ready/backlog/review 작업 ID를 nextTaskIds에 지정합니다. 완료·일반 차단·진행 중·다른 목표의 작업은 nextTaskIds로 지정하지 마세요. 단 surface:app이며 blockKind가 app 또는 app-handoff인 차단 작업은 선행 완료 시 앱 도구 인계 대상으로 지정할 수 있습니다. 이 지정은 CLI 실행이나 새 권한 승인이 아닙니다. tasks와 acceptanceEvidence는 []이고 blockedReason은 null입니다.',
    'action:follow_up은 누락된 일을 실제로 마칠 최소 작업을 tasks에 최대 4개 추가합니다. 같은 응답 localId나 실제 기존 작업 ID로 dependsOn을 연결하세요. 실제 ID·승인 필드·runtime은 만들지 마세요. nextTaskIds와 acceptanceEvidence는 [], blockedReason은 null입니다. 전체 목표의 자동 후속 작업은 누적 24개를 넘지 않습니다. 예산이 남아도 새로운 범위·미술 방향을 발명하지 마세요.',
    '그래픽 후속 제작은 그래픽 디자인(world)에 배정하고, 선행 기획 명세나 이전 그래픽 작업을 연결하세요. 필요한 실제 도구(Blender·PixelPen·Godot), 저장할 원본이나 씬, 확인할 근거를 완료 조건에 적으세요. 게임 기능·판정·저장은 개발(development)이 담당합니다.',
    'action:ready_for_acceptance는 목표 안의 모든 작업이 done이고 미해결 부서 요청·차단 판단이 없으며 모든 목표 acceptance를 실제 근거로 확인한 경우에만 가능합니다. acceptanceEvidence에 각 acceptance 문구를 정확히 한 번씩 넣고 완료된 현재 목표 task ID와 그 작업이 실제 제출한 evidence 경로를 인용하세요. 임의 경로·원시 로그·추론·프롬프트·비밀을 근거로 만들지 마세요. nextTaskIds/tasks는 []이고 blockedReason은 null입니다. 이것은 사용자 최종 인수 대기이며 목표 done이나 사용자 accept를 대신하지 않습니다.',
    '정적 확인, 실제 플레이 확인, 미술 시안 승인, 웹 게시를 구분하세요. 실행 검사를 하지 않은 제출을 플레이·화면 확인으로 바꾸어 표현하지 마세요. 제출 근거로 충족 여부를 확인할 수 없는 조건은 ready로 처리하지 말고 필요한 범위 내 검토를 배정하거나 blocked로 이유를 적으세요.',
    'action:blocked는 범위·도구·의존성·사용자 판단 때문에 더 진행할 수 없는 구체적 이유를 blockedReason에 적습니다. nextTaskIds/tasks/acceptanceEvidence는 []입니다. 기존 scope, allowedChecks, allowedCapabilities, newArt, publish를 확대하거나 승인받았다고 가정하지 마세요. 앱 전용 도구가 필요하면 surface:app으로 정확히 표시하세요.',
    '후속 작업은 실제 파일·작은 하위 디렉터리 범위로 좁히세요. docs/studio/board.json·상위 원장 디렉터리, .git/.aws/.codex/.env, 캐시·운영 비밀·개인 저장은 수정하거나 읽지 마세요. .runtime/studio/runs의 제출 결과만 필요한 근거로 참조하세요. 기존 수동 변경·확정 캐릭터·저장 ID를 보존하세요.',
    '실제 완료 보고:\n' + JSON.stringify(report),
    '함께 제출되어 같은 최종 검토에 포함할 현재 목표의 미처리 부서 보고:\n' + JSON.stringify((board.completionReports ?? []).filter((item) => item.goalId === goal.id && item.id !== report.id && item.status === 'pending')),
    goal.studioWorkflow === 'autonomous-v1' ? '이 신규 목표는 총괄이 최종 인수합니다. 시각 목표에서는 첨부 사진을 실제로 열어 시안·도구 원본과 본편 연결의 차이, 인물/구도/판독성을 판단하세요. 최종 previews에 실제로 본 완료 조건 근거 사진을 최대 3장, role(before/after/result), path, caption으로 제출하세요. after/result는 독립 검토를 통과한 final_capture의 본편 사진이어야 합니다. 부족하면 승인 범위 내 후속 작업을 지정하세요. unverified에는 직접 확인하지 않은 플레이·조작·빌드 등 이번 지시에 관련된 범위만 명시하세요. 중간 보고는 previews:[]입니다. 후속 시각 작업에 visualStage와 productionMethod를 유지하세요.' : '기존 목표는 원래 인수 절차를 유지합니다. previews와 unverified는 []입니다.',
    '변경할 수 없는 목표 계약과 전체 acceptance:\n' + JSON.stringify(goal),
    '현재 목표의 실제 작업과 제출 근거:\n' + JSON.stringify(tasks),
    '현재 목표의 부서 요청:\n' + JSON.stringify(board.requests.filter((item) => item.goalId === goal.id)),
    '미해결 판단:\n' + JSON.stringify(board.decisions.filter((item) => item.goalId === goal.id && item.status === 'pending')),
    '보고를 완료한 부서의 선행·요청 맥락:\n' + JSON.stringify(buildTaskHandoff(board, board.tasks.find((task) => task.id === report.taskId))),
    '응답은 제공된 JSON schema 하나로 작성하고 reportId:' + report.id + ', goalId:' + goal.id + '를 정확히 유지하세요.',
  ].join('\n\n');
}

export function beginCompletionReview(board, reportId) {
  validateBoard(board);
  const candidate = structuredClone(board);
  const report = findReport(candidate, reportId);
  approvedGoal(candidate, report);
  if (report.status !== 'pending' || report.attempts !== 0) fail('이미 시도했거나 처리한 완료 보고는 자동으로 다시 호출하지 않습니다.');
  report.status = 'processing'; report.attempts = 1; report.startedAt = now();
  setSupervision(candidate, report, 'processing', '총괄이 부서 완료 결과와 남은 구현·목표 조건을 확인하는 실행을 준비합니다.');
  recordCollaboration(candidate, { id: eventKey(report) + '-STARTED', goalId: report.goalId, taskId: report.taskId, kind: 'completion_review_started', status: 'processing',
    fromDepartmentId: report.organization, toDepartmentId: 'director', title: '총괄 완료 보고 검토 실행 준비', summary: report.producerSummary,
    reason: report.reviewSummary, evidence: report.evidence, sourceCommandIds: report.sourceCommandIds });
  validateBoard(candidate);
  return candidate;
}

export function normalizeCompletionDecision(board, reportId, result, { imageEvidence = [] } = {}) {
  validateBoard(board);
  const report = findReport(board, reportId);
  const goal = approvedGoal(board, report);
  if (report.status !== 'processing' || report.attempts !== 1) fail('실행 중인 한 번의 완료 보고만 인수할 수 있습니다.');
  object(result, [...FIELDS, ...['previews', 'unverified'].filter((key) => Object.hasOwn(result ?? {}, key))], '응답');
  const autonomous = goal.studioWorkflow === 'autonomous-v1';
  const previews = result.previews ?? [];
  const unverified = strings(result.unverified ?? [], '미확인 범위');
  if (!Array.isArray(previews) || previews.length > 3 || unverified.length > 8 || (result.action !== 'ready_for_acceptance' && previews.length)) fail('대표 사진은 최종 인수 시 최대 3장이며 미확인 항목은 최대 8개입니다.');
  if (result.reportId !== report.id || result.goalId !== goal.id) fail('응답의 실제 보고·목표 ID가 다릅니다.');
  if (!['continue', 'follow_up', 'ready_for_acceptance', 'blocked'].includes(result.action)) fail('알 수 없는 완료 조정 방식입니다.');
  text(result.summary, '응답.summary');
  strings(result.nextTaskIds, '응답.nextTaskIds');
  if (result.nextTaskIds.length > 12 || !Array.isArray(result.tasks) || result.tasks.length > 4 || !Array.isArray(result.acceptanceEvidence)) fail('후속 작업·배정·조건 근거의 수량을 확인해 주세요.');
  if (result.blockedReason !== null) text(result.blockedReason, '응답.blockedReason');
  const patch = { reportId, goalId: goal.id, action: result.action, summary: result.summary, nextTaskIds: [], tasks: [],
    acceptanceEvidence: [], previews: [], unverified, imageEvidence: structuredClone(imageEvidence), blockedReason: result.blockedReason, sourceCommandIds: [...report.sourceCommandIds], rawResult: structuredClone(result) };
  const done = new Set(board.tasks.filter((task) => task.status === 'done').map((task) => task.id));
  if (result.action === 'continue') {
    if (!result.nextTaskIds.length || result.tasks.length || result.acceptanceEvidence.length || result.blockedReason !== null) fail('continue는 실제 다음 작업 ID만 지정해야 합니다.');
    for (const id of result.nextTaskIds) {
      const task = board.tasks.find((item) => item.id === id);
      const appHandoff = task?.status === 'blocked' && task.surface === 'app' && ['app', 'app-handoff'].includes(task.runtime?.blockKind);
      if (!task || task.goalId !== goal.id || (!['ready', 'backlog', 'review'].includes(task.status) && !appHandoff)
        || !task.dependsOn.every((id) => done.has(id))) fail('현재 실행 또는 앱 인계가 가능한 기존 목표 작업이 아닙니다: ' + id);
      assertTaskAuthorized(board, task, { surface: task.surface ?? 'cli' });
    }
    patch.nextTaskIds = [...result.nextTaskIds];
  } else if (result.action === 'follow_up') {
    if (!result.tasks.length || result.nextTaskIds.length || result.acceptanceEvidence.length || result.blockedReason !== null) fail('follow_up은 실제 후속 작업만 추가해야 합니다.');
    const old = board.tasks.filter((task) => task.goalId === goal.id);
    if (old.filter((task) => task.runtime?.createdByCompletionReportId).length + result.tasks.length > MAX_FOLLOW_UP_TASKS) fail('목표의 자동 후속 작업 상한 24개에 도달했습니다.');
    if (board.tasks.length + result.tasks.length > 200) fail('원장 작업 상한 200개를 넘을 수 없습니다.');
    const aliases = new Map();
    for (const [index, item] of result.tasks.entries()) {
      object(item, [...TASK_FIELDS, ...['productionMethod', 'visualStage'].filter((key) => Object.hasOwn(item ?? {}, key))], `tasks[${index}]`);
      text(item.localId, '작업 별칭');
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.localId) || aliases.has(item.localId) || board.tasks.some((task) => task.id === item.localId)) fail('중복되거나 모호한 후속 작업 별칭입니다.');
      aliases.set(item.localId, report.id + '-F' + String(index + 1).padStart(2, '0'));
    }
    const nextPriority = Math.min(0, ...old.filter((task) => task.status !== 'done').map((task) => task.priority)) - result.tasks.length;
    patch.tasks = result.tasks.map((item, index) => {
      text(item.title, '후속 작업 제목'); text(item.playerChange, '후속 작업 결과');
      if (!ORGANIZATIONS.includes(item.organization)) fail('알 수 없는 후속 담당 부서입니다.');
      strings(item.dependsOn, '후속 선행 작업'); strings(item.capabilities, '후속 작업 능력', { nonempty: true });
      strings(item.checks, '후속 검사'); strings(item.acceptance, '후속 완료 조건', { nonempty: true });
      if (!['cli', 'app'].includes(item.surface)) fail('후속 실행 위치가 올바르지 않습니다.');
      const task = { id: aliases.get(item.localId), goalId: goal.id, title: item.title, organization: item.organization,
        playerChange: item.playerChange, status: item.surface === 'app' ? 'blocked' : 'ready', priority: nextPriority + index,
        dependsOn: [...new Set([report.taskId, ...item.dependsOn.map((id) => aliases.get(id) ?? (board.tasks.some((task) => task.id === id) ? id : fail('없는 후속 선행 작업입니다: ' + id)))])],
        scope: scope(item.scope, '후속 작업.scope'), capabilities: [...item.capabilities], checks: [...item.checks], acceptance: [...item.acceptance], surface: item.surface,
        runtime: { createdByCompletionReportId: report.id, sourceTaskId: report.taskId, sourceCommandIds: [...report.sourceCommandIds] } };
      if (item.productionMethod != null) {
        if (!['blender', 'pixelpen', 'godot'].includes(item.productionMethod) || item.organization !== 'world') fail('후속 제작 도구와 부서를 확인해 주세요.');
        task.productionMethod = item.productionMethod;
      }
      if (item.visualStage != null) {
        if (!goal.visualContract || !VISUAL_STAGES.includes(item.visualStage)) fail('후속 시각 단계가 목표 계약에 없습니다.');
        task.visualStage = item.visualStage;
        if (item.visualStage === 'final_capture') {
          task.mainEntry = goal.visualContract.mainEntry;
          if (goal.visualContract.targetScene) task.targetScene = goal.visualContract.targetScene;
          for (const name of [task.mainEntry, task.targetScene].filter(Boolean)) if (!isWithinScope(name, task.scope.read)) task.scope.read.push(name);
        }
      }
      if (autonomous) applyEditorLock(task);
      if (item.surface === 'app' && autonomous && item.productionMethod) task.status = 'ready';
      else if (item.surface === 'app') Object.assign(task.runtime, { blockKind: 'app-handoff', blockReason: '총괄이 배정한 후속 작업에는 앱 도구 인계가 필요합니다.' });
      if (goal.approval.publicationIntent && task.capabilities.includes('publish')) {
        const intent = goal.approval.publicationIntent;
        if (!task.scope.write.every((entry) => isWithinScope(entry, [intent.scope]))) fail('후속 게시가 승인된 사이트 대상을 벗어납니다.');
        task.runtime.publicationIntent = structuredClone(intent);
      }
      assertTaskAuthorized(board, task, { surface: item.surface });
      if (board.tasks.some((existing) => existing.id === task.id)) fail('후속 작업 ID가 이미 있습니다.');
      if (old.some((existing) => samePurpose(existing, task))) fail('이미 배정한 동일 목적의 후속 작업을 다시 만들 수 없습니다.');
      return task;
    });
    for (let index = 0; index < patch.tasks.length; index += 1) if (patch.tasks.slice(0, index).some((task) => samePurpose(task, patch.tasks[index]))) fail('같은 응답에 동일 목적의 후속 작업이 중복되었습니다.');
    const candidate = structuredClone(board); candidate.tasks.push(...patch.tasks); validateBoard(candidate);
    const combined = new Map(candidate.tasks.map((task) => [task.id, task]));
    const newIds = new Set(patch.tasks.map((task) => task.id));
    const visiting = new Set();
    const visited = new Set();
    const include = (id) => {
      const task = combined.get(id);
      if (!task || task.status === 'done' || task.goalId !== goal.id || visited.has(id)) return;
      if (visiting.has(id)) fail('후속 작업의 선행 관계에 순환이 있습니다.');
      if (!newIds.has(id)) {
        const appHandoff = task.status === 'blocked' && task.surface === 'app' && ['app', 'app-handoff'].includes(task.runtime?.blockKind);
        if (!['ready', 'backlog', 'review'].includes(task.status) && !appHandoff) fail('후속 작업에 필요한 기존 선행 작업이 실행·인계 가능한 상태가 아닙니다: ' + id);
        assertTaskAuthorized(candidate, task, { surface: task.surface ?? 'cli' });
      }
      visiting.add(id);
      for (const dependency of task.dependsOn) include(dependency);
      visiting.delete(id); visited.add(id); patch.nextTaskIds.push(id);
    };
    for (const task of patch.tasks) include(task.id);
  } else if (result.action === 'ready_for_acceptance') {
    if (result.nextTaskIds.length || result.tasks.length || result.blockedReason !== null) fail('최종 사용자 인수 대기에는 새 작업을 포함할 수 없습니다.');
    const tasks = board.tasks.filter((task) => task.goalId === goal.id);
    if (!tasks.length || tasks.some((task) => task.status !== 'done')) fail('미완료 작업이 남아 있으면 목표 전체 확인을 완료할 수 없습니다.');
    if (board.requests.some((request) => request.goalId === goal.id && (['pending', 'escalated'].includes(request.status ?? 'pending') || (request.blocking === true && request.status === 'deferred')))
      || board.decisions.some((decision) => decision.goalId === goal.id && decision.status === 'pending' && decision.blocking !== false)) fail('미해결 부서 요청·차단 판단이 남아 있습니다.');
    const criteria = new Set();
    for (const entry of result.acceptanceEvidence) {
      object(entry, ['criterion', 'completedTaskIds', 'evidence'], '완료 조건 근거');
      text(entry.criterion, '완료 조건'); strings(entry.completedTaskIds, '조건을 충족한 완료 작업', { nonempty: true });
      if (!goal.acceptance.includes(entry.criterion) || criteria.has(entry.criterion)) fail('목표의 완료 조건 문구를 중복 없이 정확히 대응시켜 주세요.');
      criteria.add(entry.criterion);
      const referenced = entry.completedTaskIds.map((id) => tasks.find((task) => task.id === id));
      if (referenced.some((task) => !task || task.status !== 'done')) fail('조건 근거는 현재 목표의 실제 완료 작업이어야 합니다.');
      if (!Array.isArray(entry.evidence) || !entry.evidence.length) fail('목표 조건마다 실제 제출 근거가 필요합니다.');
      const paths = new Set(referenced.flatMap(taskEvidence).map((item) => item.path));
      const evidence = entry.evidence.map((item) => {
        object(item, ['path', 'summary'], '조건 근거'); text(item.path, '조건 근거 경로'); text(item.summary, '조건 충족 설명');
        if (!paths.has(item.path) || collaborationEvidence([item]).length !== 1) fail('완료 작업이 제출하지 않은 근거 경로입니다: ' + item.path);
        return { path: item.path, summary: item.summary };
      });
      if (new Set(evidence.map((item) => item.path)).size !== evidence.length) fail('같은 완료 조건의 근거 경로가 중복되었습니다.');
      patch.acceptanceEvidence.push({ criterion: entry.criterion, completedTaskIds: [...entry.completedTaskIds], evidence });
    }
    if (criteria.size !== goal.acceptance.length) fail('모든 목표 완료 조건에 실제 제출 근거가 필요합니다.');
    const cited = new Set(patch.acceptanceEvidence.flatMap((entry) => entry.evidence.map((item) => item.path)));
    const finalCuts = tasks.filter((item) => item.visualStage === 'final_capture').flatMap((item) =>
      (item.runtime?.reviewedImages ?? []).filter((image) => isWithinScope(image.path, item.scope.write)
        && item.runtime?.producerEvidence?.some((entry) => entry.path === image.path)));
    for (const preview of previews) {
      object(preview, ['role','path','caption'], '최종 대표 사진');
      text(preview.caption, '사진 설명');
      const record = imageEvidence.find((item) => item.path === preview.path);
      if (!autonomous || !['before','after','result'].includes(preview.role) || preview.caption.length > 220 || !cited.has(preview.path)
        || !record || !/^[a-f0-9]{64}$/.test(record.sha256) || !/\.(png|jpe?g|webp)$/i.test(preview.path)
        || patch.previews.some((item) => item.path === preview.path)) fail('실제 입력하고 조건 근거에 인용한 고유 대표 사진이어야 합니다.');
      if (preview.role !== 'before' && !finalCuts.some((cut) => cut.path === preview.path && cut.sha256 === record.sha256)) fail('최종 결과 사진은 독립 검토한 본편 컷이어야 합니다.');
      patch.previews.push({ ...preview, sha256: record.sha256 });
    }
    if (autonomous && goal.visualContract && !patch.previews.some((item) => item.role !== 'before')) fail('실제 본편 최종 화면을 확인하고 대표 결과 사진을 선택해 주세요.');
  } else if (result.nextTaskIds.length || result.tasks.length || result.acceptanceEvidence.length || result.blockedReason === null) {
    fail('blocked에는 구체적 보류 이유만 남겨 주세요.');
  }
  patch.digest = hash({ reportId: patch.reportId, goalId: patch.goalId, action: patch.action, summary: patch.summary,
    nextTaskIds: patch.nextTaskIds, tasks: patch.tasks, acceptanceEvidence: patch.acceptanceEvidence, previews: patch.previews, unverified: patch.unverified, blockedReason: patch.blockedReason });
  return patch;
}

export function applyCompletionDecision(board, reportId, patch, { resultPath = null } = {}) {
  const report = findReport(board, reportId);
  if (['processed', 'blocked'].includes(report.status)) {
    if (report.decision?.digest === patch?.digest) return structuredClone(board);
    fail('같은 완료 보고의 결정을 다시 적용할 수 없습니다.');
  }
  const normalized = normalizeCompletionDecision(board, reportId, patch?.rawResult, { imageEvidence: patch?.imageEvidence });
  if (normalized.digest !== patch?.digest) fail('검증 이후 완료 조정 내용이 바뀌었습니다.');
  const candidate = structuredClone(board);
  const stored = findReport(candidate, reportId);
  const goal = approvedGoal(candidate, stored);
  if (resultPath !== null && collaborationEvidence([{ path: resultPath, summary: '총괄 완료 조정 결과' }]).length !== 1) fail('안전한 총괄 결과 경로가 필요합니다.');
  candidate.tasks.push(...structuredClone(normalized.tasks));
  stored.status = normalized.action === 'blocked' ? 'blocked' : 'processed'; stored.processedAt = now(); stored.resultPath = resultPath;
  stored.decision = { action: normalized.action, summary: normalized.summary, nextTaskIds: [...normalized.nextTaskIds],
    addedTaskIds: normalized.tasks.map((task) => task.id), acceptanceEvidence: structuredClone(normalized.acceptanceEvidence), previews: normalized.previews, unverified: normalized.unverified, blockedReason: normalized.blockedReason, digest: normalized.digest };
  if (normalized.action === 'blocked') blockingDecision(candidate, stored, normalized.blockedReason);
  const state = { continue: 'continuing', follow_up: 'follow_up', ready_for_acceptance: 'ready_for_acceptance', blocked: 'blocked' }[normalized.action];
  setSupervision(candidate, stored, state, normalized.blockedReason ?? normalized.summary, normalized);
  const autoAccepted = goal.studioWorkflow === 'autonomous-v1' && normalized.action === 'ready_for_acceptance';
  if (autoAccepted) {
    goal.status = 'done';
    for (const other of candidate.completionReports.filter((item) => item.goalId === goal.id && item.id !== reportId && item.status === 'pending')) {
      Object.assign(other, { status: 'processed', attempts: 1, startedAt: stored.startedAt, processedAt: stored.processedAt,
        reviewedWith: stored.id, resultPath, decision: { action: 'covered_by_final_review', summary: normalized.summary } });
    }
  }
  const firstPriority = Math.min(0, ...candidate.tasks.filter((task) => task.goalId === goal.id && task.status !== 'done').map((task) => task.priority)) - normalized.nextTaskIds.length;
  for (const [index, id] of normalized.nextTaskIds.entries()) {
    const task = candidate.tasks.find((item) => item.id === id);
    task.priority = firstPriority + index;
    const added = normalized.tasks.some((item) => item.id === id);
    recordCollaboration(candidate, { id: eventKey(report) + '-ASSIGN-' + id, goalId: goal.id, taskId: id, relatedTaskId: report.taskId,
      kind: added ? 'assigned' : 'director_assigned', status: task.status,
      fromDepartmentId: 'director', toDepartmentId: task.organization, title: added ? '총괄이 남은 구현·통합 작업을 추가 배정' : '총괄이 다음 담당 작업을 지정',
      summary: task.playerChange, reason: normalized.summary, sourceCommandIds: report.sourceCommandIds });
  }
  recordCollaboration(candidate, { id: eventKey(report) + '-REVIEWED', goalId: goal.id, taskId: report.taskId, kind: 'completion_reviewed', status: normalized.action,
    fromDepartmentId: 'director', toDepartmentId: normalized.action === 'blocked' ? 'director' : null,
    title: autoAccepted ? '총괄 최종 인수 완료' : normalized.action === 'ready_for_acceptance' ? '총괄 목표 전체 확인 · 최종 사용자 인수 대기' : normalized.action === 'blocked' ? '총괄 완료 조정 보류' : '총괄 완료 보고 확인 · 후속 진행 결정',
    summary: normalized.summary, reason: normalized.blockedReason ?? (autoAccepted ? '계약의 완료 조건과 제출 근거를 확인했습니다.' : '목표 최종 인수는 사용자님께 남깁니다.'),
    evidence: normalized.acceptanceEvidence.flatMap((entry) => entry.evidence).concat(resultPath ? [{ path: resultPath, summary: '총괄 완료 조정 결과' }] : []), sourceCommandIds: report.sourceCommandIds });
  validateBoard(candidate);
  return candidate;
}

export function failCompletionReview(board, reportId, error, { resultPath = null } = {}) {
  const candidate = structuredClone(board);
  const report = findReport(candidate, reportId);
  if (['processed', 'blocked'].includes(report.status)) return candidate;
  const message = typeof error === 'string' ? error : error?.message ?? '총괄 완료 조정 응답을 인수하지 못했습니다.';
  const summary = '총괄 완료 조정을 보류했습니다. ' + message.slice(0, 1000);
  report.status = 'blocked'; report.attempts = 1; report.processedAt = now(); report.resultPath = resultPath && collaborationEvidence([{ path: resultPath, summary: '총괄 응답' }]).length === 1 ? resultPath : null;
  blockingDecision(candidate, report, summary);
  report.failure = { fingerprint: hash({ reportId, message }), conditionToRetry: '실패 원인과 달라진 전제를 확인한 후 명시적인 재개 판단이 필요합니다. 같은 완료 보고를 자동 재호출하지 않습니다.' };
  setSupervision(candidate, report, 'blocked', summary);
  recordCollaboration(candidate, { id: eventKey(report) + '-FAILED', goalId: report.goalId, taskId: report.taskId, kind: 'completion_review_blocked', status: 'blocked',
    fromDepartmentId: 'director', toDepartmentId: 'director', title: '총괄 완료 조정 차단 · 자동 재호출 중지', summary,
    reason: report.failure.conditionToRetry, sourceCommandIds: report.sourceCommandIds });
  validateBoard(candidate);
  return candidate;
}
/** Only an explicit user's new resumption reason can reopen a blocked report. */
export function retryCompletionReview(board, reportId, { reason, by, sourceCommandId = null } = {}) {
  validateBoard(board);
  text(reason, '달라진 재개 근거'); text(by, '재개를 지시한 사용자');
  const candidate = structuredClone(board);
  const report = findReport(candidate, reportId);
  approvedGoal(candidate, report);
  if (report.status !== 'blocked' || report.attempts !== 1) fail('차단된 완료 보고만 명시적으로 재개할 수 있습니다.');
  const previousReason = report.retries?.at(-1)?.reason;
  if (previousReason && normalizePurpose(previousReason) === normalizePurpose(reason)) fail('이전과 달라진 재개 근거를 남겨 주세요. 같은 실패를 자동 반복하지 않습니다.');
  const at = now();
  report.retries ??= [];
  report.retries.push({ at, by, reason, previousFailure: structuredClone(report.failure), previousDecision: structuredClone(report.decision), previousResultPath: report.resultPath });
  for (const decision of candidate.decisions.filter((item) => item.sourceCompletionReportId === report.id && item.status === 'pending')) {
    Object.assign(decision, { status: 'resolved', resolution: reason, decidedBy: by, decidedAt: at });
  }
  report.status = 'pending'; report.attempts = 0; report.startedAt = null; report.processedAt = null;
  report.failure = null; report.decision = null; report.resultPath = null;
  if (sourceCommandId !== null) {
    text(sourceCommandId, '실제 재개 명령 ID');
    report.sourceCommandIds = [...new Set([...report.sourceCommandIds, sourceCommandId])];
  }
  setSupervision(candidate, report, 'pending', '사용자님이 달라진 전제를 명시해 해당 완료 보고의 총괄 조정만 다시 대기합니다.');
  recordCollaboration(candidate, { id: eventKey(report) + '-RESUMED', goalId: report.goalId, taskId: report.taskId, kind: 'completion_review_resumed', status: 'pending',
    fromDepartmentId: 'director', toDepartmentId: 'director', title: '사용자 명시 답변으로 총괄 완료 조정 재개', summary: reason,
    reason: '완료 작업은 done으로 보존하며 자동 재시도가 아닌 한 번의 명시 재개를 기록합니다.', sourceCommandIds: report.sourceCommandIds, at });
  validateBoard(candidate);
  return candidate;
}
