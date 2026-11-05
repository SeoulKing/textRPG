import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { validateModelPolicy, resolveExecution } from './model-policy.mjs';

export const ORGANIZATIONS = Object.freeze([
  'director', 'design', 'narrative', 'world', 'character', 'development', 'quality',
]);

const TASK_STATUSES = new Set(['backlog', 'ready', 'active', 'review', 'done', 'blocked']);
const GOAL_STATUSES = new Set(['active', 'planned', 'done']);
const CAPABILITIES = new Set(['static', 'code', 'content', 'art', 'ui', 'export', 'test', 'browser', 'publish']);
const TRANSITIONS = {
  backlog: new Set(['ready', 'blocked']),
  ready: new Set(['active', 'blocked']),
  active: new Set(['review', 'blocked']),
  review: new Set(['done', 'ready', 'blocked']),
  blocked: new Set(['ready']),
  done: new Set(),
};
const BOARD_PATH = 'docs/studio/board.json';
const LOCK_PATH = '.runtime/studio/lock.json';
const RUNS_PATH = '.runtime/studio/runs';
const BROAD_WRITE_SCOPES = new Set(['src', 'godot-arcana', 'docs', 'scripts', 'art-studies', 'assets', 'godot-web']);
const MAX_BASELINE_FILES = 10000;
const MAX_BASELINE_BYTES = 256 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}은 객체여야 합니다.`);
}

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}에 비어 있지 않은 문자열이 필요합니다.`);
}

function stringArray(value, label, { nonemptyArray = false } = {}) {
  if (!Array.isArray(value) || (nonemptyArray && value.length === 0)) fail(`${label}은 문자열 배열이어야 합니다.`);
  for (const item of value) nonempty(item, label);
}

function identifier(value, label) {
  nonempty(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) fail(`${label}에는 영문·숫자·하이픈·밑줄만 사용할 수 있습니다.`);
}

function relativePath(value) {
  nonempty(value, '상대 경로');
  const slash = value.replaceAll('\\', '/');
  if (/[\x00-\x1f\x7f:*?"<>|]/.test(slash) || path.posix.isAbsolute(slash) || path.win32.isAbsolute(value)) {
    fail(`안전한 작업 상대 경로가 아닙니다: ${value}`);
  }
  const parts = slash.replace(/\/+$/, '').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) fail(`상대 경로에 빈 항목이나 상위 이동이 있습니다: ${value}`);
  return parts.join('/');
}

function pathKey(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function sensitiveSegment(segment) {
  const item = segment.toLowerCase();
  return ['.git', '.aws', '.codex', 'node_modules', '.godot', '.server-dist', '__pycache__'].includes(item)
    || item === '.env'
    || (item.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(item));
}

function safeScope(value, { write = false } = {}) {
  const normalized = relativePath(value);
  const segments = normalized.split('/');
  if (segments.some(sensitiveSegment) || (write && segments[0].toLowerCase() === '.runtime')) {
    fail(`기밀·캐시·운영 상태는 제작 수정 범위로 사용할 수 없습니다: ${value}`);
  }
  return normalized;
}

export function isWithinScope(value, scopes) {
  try {
    const candidate = pathKey(relativePath(value));
    if (!Array.isArray(scopes)) return false;
    return scopes.some((scope) => {
      const base = pathKey(relativePath(scope));
      return candidate === base || candidate.startsWith(`${base}/`);
    });
  } catch {
    return false;
  }
}

function validateScope(scope, label, { needsRead = false } = {}) {
  record(scope, label);
  stringArray(scope.write, `${label}.write`);
  if (needsRead || scope.read !== undefined) stringArray(scope.read, `${label}.read`);
  for (const item of scope.write) safeScope(item, { write: true });
  for (const item of scope.read ?? []) safeScope(item);
}

export function validateBoard(board) {
  record(board, '작업 원장');
  if (board.version !== 1 || board.project !== 'arcana') fail('작업 원장의 version: 1과 project: arcana를 확인해 주세요.');
  record(board.settings, 'settings');
  for (const key of ['maxConcurrentAgents', 'defaultMinutes', 'maxReviewPasses']) {
    if (!Number.isInteger(board.settings[key]) || board.settings[key] < 1) fail(`settings.${key}에는 양의 정수가 필요합니다.`);
  }
  if (board.settings.maxConcurrentAgents > 4) fail('초기 조직의 동시 실행 상한은 4명입니다.');
  if (board.settings.defaultMinutes > 90) fail('실행 시간 기본값은 90분 이하로 지정해 주세요.');
  if (board.settings.maxReviewPasses > 2) fail('독립 검토 회차 상한은 2회입니다.');
  validateModelPolicy(board.settings, ORGANIZATIONS);
  for (const key of ['goals', 'tasks', 'decisions', 'requests']) {
    if (!Array.isArray(board[key])) fail(`${key}는 배열이어야 합니다.`);
  }
  const goals = new Map();
  for (const goal of board.goals) {
    record(goal, '목표');
    identifier(goal.id, '목표 ID');
    if (goals.has(goal.id)) fail(`중복된 목표 ID입니다: ${goal.id}`);
    goals.set(goal.id, goal);
    nonempty(goal.title, `${goal.id}.title`);
    if (!GOAL_STATUSES.has(goal.status)) fail(`알 수 없는 목표 상태입니다: ${goal.id}`);
    record(goal.approval, `${goal.id}.approval`);
    if (!['approved', 'pending'].includes(goal.approval.status)) fail(`목표 승인 상태를 확인해 주세요: ${goal.id}`);
    stringArray(goal.approval.allowedChecks, `${goal.id}.approval.allowedChecks`);
    if (goal.approval.allowedCapabilities !== undefined) {
      stringArray(goal.approval.allowedCapabilities, `${goal.id}.approval.allowedCapabilities`);
      if (!goal.approval.allowedCapabilities.every((item) => CAPABILITIES.has(item))) fail(`알 수 없는 목표 작업 능력이 있습니다: ${goal.id}`);
    }
    if (goal.dependsOnGoals !== undefined) {
      stringArray(goal.dependsOnGoals, `${goal.id}.dependsOnGoals`);
      if (new Set(goal.dependsOnGoals).size !== goal.dependsOnGoals.length) fail(`선행 목표가 중복되었습니다: ${goal.id}`);
    }
    if (typeof goal.approval.newArt !== 'boolean' || typeof goal.approval.publish !== 'boolean') {
      fail(`미술·게시 권한은 명시적인 참/거짓이어야 합니다: ${goal.id}`);
    }
    if (goal.approval.status === 'approved') {
      nonempty(goal.approval.approvedBy, `${goal.id}.approval.approvedBy`);
      nonempty(goal.approval.approvedAt, `${goal.id}.approval.approvedAt`);
      if (!Number.isFinite(Date.parse(goal.approval.approvedAt))) fail(`승인 시각을 확인해 주세요: ${goal.id}`);
    }
    validateScope(goal.scope, `${goal.id}.scope`);
    stringArray(goal.acceptance, `${goal.id}.acceptance`, { nonemptyArray: true });
  }
  const goalVisiting = new Set();
  const goalVisited = new Set();
  function visitGoal(id) {
    if (goalVisiting.has(id)) fail(`선행 목표에 순환이 있습니다: ${id}`);
    if (goalVisited.has(id)) return;
    goalVisiting.add(id);
    for (const dependency of goals.get(id).dependsOnGoals ?? []) {
      if (!goals.has(dependency)) fail(`없는 선행 목표입니다: ${id} -> ${dependency}`);
      visitGoal(dependency);
    }
    goalVisiting.delete(id);
    goalVisited.add(id);
  }
  for (const id of goals.keys()) visitGoal(id);
  const tasks = new Map();
  for (const task of board.tasks) {
    record(task, '작업');
    identifier(task.id, '작업 ID');
    if (tasks.has(task.id)) fail(`중복된 작업 ID입니다: ${task.id}`);
    tasks.set(task.id, task);
    const goal = goals.get(task.goalId);
    if (!goal) fail(`작업이 없는 목표를 참조합니다: ${task.id} -> ${task.goalId}`);
    nonempty(task.title, `${task.id}.title`);
    nonempty(task.playerChange, `${task.id}.playerChange`);
    resolveExecution(board, task, 'producer');
    resolveExecution(board, task, 'reviewer');
    if (!ORGANIZATIONS.includes(task.organization)) fail(`알 수 없는 담당 조직입니다: ${task.id}`);
    if (!TASK_STATUSES.has(task.status)) fail(`알 수 없는 작업 상태입니다: ${task.id}`);
    if (!Number.isFinite(task.priority)) fail(`작업 우선순위에 숫자가 필요합니다: ${task.id}`);
    stringArray(task.dependsOn, `${task.id}.dependsOn`);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) fail(`선행 작업이 중복되었습니다: ${task.id}`);
    validateScope(task.scope, `${task.id}.scope`, { needsRead: true });
    if (!task.scope.write.every((item) => isWithinScope(item, goal.scope.write))) fail(`작업 수정 범위가 승인 목표의 범위를 벗어납니다: ${task.id}`);
    stringArray(task.capabilities, `${task.id}.capabilities`);
    if (!task.capabilities.every((item) => CAPABILITIES.has(item))) fail(`알 수 없는 작업 능력이 있습니다: ${task.id}`);
    if (task.checks !== undefined) stringArray(task.checks, `${task.id}.checks`);
    if (task.surface !== undefined && !['cli', 'app'].includes(task.surface)) fail(`작업 실행 위치는 cli 또는 app이어야 합니다: ${task.id}`);
    stringArray(task.acceptance, `${task.id}.acceptance`, { nonemptyArray: true });
    if (task.runtime !== undefined) record(task.runtime, `${task.id}.runtime`);
    if (task.status === 'done') {
      record(task.runtime, `${task.id}.runtime`);
      nonempty(task.runtime.reviewResultPath, `${task.id}.runtime.reviewResultPath`);
      stringArray(task.runtime.evidence, `${task.id}.runtime.evidence`, { nonemptyArray: true });
    }
  }
  for (const task of tasks.values()) {
    for (const dependency of task.dependsOn) {
      if (!tasks.has(dependency)) fail(`없는 선행 작업입니다: ${task.id} -> ${dependency}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`선행 작업에 순환이 있습니다: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return board;
}

function inside(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function checkedPath(root, relative) {
  const workspace = path.resolve(root);
  const target = path.resolve(workspace, relativePath(relative));
  if (!inside(workspace, target)) fail('경로가 작업 공간을 벗어납니다.');
  const physicalWorkspace = fs.realpathSync(workspace);
  let ancestor = target;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail('경로의 기존 상위 디렉터리를 찾지 못했습니다.');
    ancestor = parent;
  }
  const physicalAncestor = fs.realpathSync(ancestor);
  if (!inside(physicalWorkspace, physicalAncestor)) fail(`링크·junction 경로가 작업 공간 밖을 가리킵니다: ${relative}`);
  const physicalRelative = path.relative(physicalWorkspace, physicalAncestor).split(path.sep).join('/');
  if (physicalRelative) safeScope(physicalRelative);
  return target;
}

function ensureDirectory(root, relative) {
  const target = checkedPath(root, relative);
  fs.mkdirSync(target, { recursive: true });
  return checkedPath(root, relative);
}

function atomicJson(root, relative, value) {
  const target = checkedPath(root, relative);
  const parentRelative = path.posix.dirname(relativePath(relative));
  if (parentRelative !== '.') ensureDirectory(root, parentRelative);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function readBoard(root) {
  const text = fs.readFileSync(checkedPath(root, BOARD_PATH), 'utf8').replace(/^\uFEFF/, '');
  return validateBoard(JSON.parse(text));
}

export function writeBoard(root, board) {
  validateBoard(board);
  atomicJson(root, BOARD_PATH, board);
}

export function findGoal(board, id) {
  const goal = board.goals.find((candidate) => candidate.id === id);
  if (!goal) fail(`목표를 찾지 못했습니다: ${id}`);
  return goal;
}

export function findTask(board, id) {
  const task = board.tasks.find((candidate) => candidate.id === id);
  if (!task) fail(`작업을 찾지 못했습니다: ${id}`);
  return task;
}

export function selectTask(board, goalId) {
  const goal = findGoal(board, goalId);
  if (goal.approval.status !== 'approved' || goal.status === 'done') return null;
  const done = new Set(board.tasks.filter((task) => task.status === 'done').map((task) => task.id));
  return board.tasks
    .filter((task) => task.goalId === goalId
      && ['review', 'ready', 'backlog'].includes(task.status)
      && task.dependsOn.every((dependency) => done.has(dependency)))
    .sort((left, right) => Number(right.status === 'review') - Number(left.status === 'review')
      || left.priority - right.priority || left.id.localeCompare(right.id, 'en'))[0] ?? null;
}

export function transitionTask(board, taskId, status, details = {}) {
  const task = findTask(board, taskId);
  record(details, '작업 진행 정보');
  if (!TASK_STATUSES.has(status) || !TRANSITIONS[task.status]?.has(status)) fail(`허용되지 않은 작업 상태 전이입니다: ${taskId} ${task.status} -> ${status}`);
  if (status === 'done') {
    nonempty(details.reviewResultPath, '독립 검토 결과 경로');
    stringArray(details.evidence, '완료 증거', { nonemptyArray: true });
  }
  const updatedAt = new Date().toISOString();
  task.runtime = { ...(task.runtime ?? {}), ...details, updatedAt };
  task.status = status;
  task.updatedAt = updatedAt;
  return task;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    return null;
  }
}

export function lockStatus(root) {
  const lockPath = checkedPath(root, LOCK_PATH);
  if (!fs.existsSync(lockPath)) return { locked: false, path: lockPath };
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { locked: true, path: lockPath, alive: null, invalid: true };
  }
  const sameHost = lock.host === os.hostname();
  return { ...lock, locked: true, path: lockPath, alive: sameHost ? pidAlive(lock.pid) : null, sameHost };
}

export function acquireLock(root, { owner, goalId }) {
  nonempty(owner, '실행 소유자');
  identifier(goalId, '목표 ID');
  ensureDirectory(root, '.runtime/studio');
  const lockPath = checkedPath(root, LOCK_PATH);
  const token = crypto.randomUUID();
  const lock = { owner, goalId, pid: process.pid, host: os.hostname(), token, startedAt: new Date().toISOString() };
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = lockStatus(root);
    fail(existing.alive === true
      ? `다른 총괄이 실행 중입니다: ${existing.owner} (PID ${existing.pid}).`
      : '기존 실행 잠금이 남아 있습니다. 소유 프로세스를 확인한 뒤 중단된 잠금만 해제해 주세요.');
  }
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.unlinkSync(lockPath);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return { path: lockPath, token };
}

export function releaseLock(lock) {
  if (!lock || typeof lock.path !== 'string' || typeof lock.token !== 'string') fail('실행 잠금 소유권이 필요합니다.');
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(lock.path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (existing.token !== lock.token) fail('다른 실행의 잠금은 해제할 수 없습니다.');
  fs.unlinkSync(lock.path);
  return true;
}

export function clearStaleLock(root) {
  const lock = lockStatus(root);
  if (!lock.locked) return false;
  if (!lock.sameHost || lock.alive !== false) fail('현재 호스트에서 소유 PID가 종료된 잠금만 해제할 수 있습니다.');
  return releaseLock(lock);
}

export function createRun(root, goalId) {
  identifier(goalId, '목표 ID');
  const startedAt = new Date().toISOString();
  const id = `${startedAt.replaceAll(':', '-').replace('.', '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const relative = `${RUNS_PATH}/${id}`;
  const dir = ensureDirectory(root, relative);
  atomicJson(root, `${relative}/run.json`, { id, goalId, pid: process.pid, host: os.hostname(), startedAt });
  return { id, dir, startedAt };
}

export function captureBaseline(root, run, task) {
  identifier(task.id, '작업 ID');
  validateScope(task.scope, `${task.id}.scope`, { needsRead: true });
  const runRelative = path.relative(path.resolve(root), path.resolve(run.dir)).split(path.sep).join('/');
  if (!isWithinScope(runRelative, [RUNS_PATH]) || runRelative === RUNS_PATH) fail('기준 백업은 해당 실행 디렉터리 안에만 기록할 수 있습니다.');
  checkedPath(root, runRelative);
  for (const scope of task.scope.write) {
    if (BROAD_WRITE_SCOPES.has(pathKey(relativePath(scope)))) fail(`기준 백업 범위를 구체적인 파일·하위 디렉터리로 좁혀 주세요: ${scope}`);
  }
  const capturedAt = new Date().toISOString();
  const baselineRelative = `${runRelative}/baselines/${task.id}-${crypto.randomBytes(5).toString('hex')}`;
  ensureDirectory(root, `${baselineRelative}/files`);
  const entries = [];
  const seen = new Set();
  let fileCount = 0;
  let totalBytes = 0;
  function snapshot(relative, ancestors = new Set()) {
    const normalized = safeScope(relative, { write: true });
    const key = pathKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    const source = checkedPath(root, normalized);
    let stat;
    try {
      stat = fs.lstatSync(source);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.push({ path: normalized, type: 'missing', existed: false });
      return;
    }
    const physicalRelative = path.relative(fs.realpathSync(path.resolve(root)), fs.realpathSync(source)).split(path.sep).join('/');
    safeScope(physicalRelative, { write: true });
    let linkTarget;
    if (stat.isSymbolicLink()) {
      linkTarget = fs.readlinkSync(source);
      stat = fs.statSync(source);
    }
    if (stat.isDirectory()) {
      const physical = fs.realpathSync(source);
      if (ancestors.has(physical)) fail(`기준 백업에서 링크 순환을 발견했습니다: ${normalized}`);
      const nextAncestors = new Set(ancestors).add(physical);
      entries.push({ path: normalized, type: 'directory', existed: true, ...(linkTarget ? { linkTarget } : {}) });
      for (const name of fs.readdirSync(source).sort()) snapshot(`${normalized}/${name}`, nextAncestors);
      return;
    }
    if (!stat.isFile()) fail(`일반 파일·디렉터리만 기준 백업할 수 있습니다: ${normalized}`);
    fileCount += 1;
    totalBytes += stat.size;
    if (fileCount > MAX_BASELINE_FILES || totalBytes > MAX_BASELINE_BYTES) fail('기준 백업이 파일 10,000개 또는 256 MiB를 넘습니다. 작업 범위를 좁혀 주세요.');
    const bytes = fs.readFileSync(source);
    const backupRelative = `${baselineRelative}/files/${normalized}`;
    const backup = checkedPath(root, backupRelative);
    ensureDirectory(root, path.posix.dirname(backupRelative));
    fs.writeFileSync(backup, bytes, { flag: 'wx' });
    entries.push({ path: normalized, type: 'file', existed: true, size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'), backupPath: backupRelative,
      ...(linkTarget ? { linkTarget } : {}) });
  }
  for (const scope of task.scope.write) snapshot(scope);
  const manifestRelative = `${baselineRelative}/manifest.json`;
  atomicJson(root, manifestRelative, { version: 1, taskId: task.id, runId: run.id, capturedAt, fileCount, totalBytes, entries });
  return { manifestPath: checkedPath(root, manifestRelative), entries, capturedAt, fileCount, totalBytes };
}