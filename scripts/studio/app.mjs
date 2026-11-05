import fs from 'node:fs';
import path from 'node:path';
import {
  readBoard, writeBoard, findGoal, findTask, transitionTask,
  acquireLock, releaseLock, createRun, captureBaseline, isWithinScope,
} from './engine.mjs';
import { assertGoalReady, assertTaskAuthorized, validateResult, formatTaskPrompt } from './protocol.mjs';
import { resolveExecution } from './model-policy.mjs';

const RUNS_PATH = '.runtime/studio/runs';
const now = () => new Date().toISOString();
const relative = (root, filename) => path.relative(path.resolve(root), filename).split(path.sep).join('/');
const pathKey = (filename) => process.platform === 'win32' ? filename.toLowerCase() : filename;

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}을 지정해 주세요.`);
  return value.trim();
}

function inside(base, candidate) {
  const part = path.relative(base, candidate);
  return part === '' || (!path.isAbsolute(part) && part !== '..' && !part.startsWith(`..${path.sep}`));
}

function counter(runtime, key) {
  const value = runtime?.[key] ?? 0;
  if (!Number.isInteger(value) || value < 0) throw new Error(`작업의 runtime.${key} 값을 확인해 주세요.`);
  return value;
}

function assertReady(board, task) {
  const goal = findGoal(board, task.goalId);
  assertGoalReady(board, goal);
  if (goal.status === 'done') throw new Error(`이미 인수한 목표의 작업은 실행할 수 없습니다: ${goal.id}`);
  for (const id of task.dependsOn) {
    if (findTask(board, id).status !== 'done') throw new Error(`선행 작업을 먼저 인수해 주세요: ${id}`);
  }
  assertTaskAuthorized(board, task, { surface: 'app' });
  return goal;
}

function resultFile(root, value, label, runId) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) {
    throw new Error('앱 작업의 현재 실행 ID를 확인해 주세요.');
  }
  const runRelative = RUNS_PATH + '/' + runId;
  const supplied = required(value, label);
  const normalized = supplied.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(supplied)
    || /[\x00-\x1f\x7f:*?"<>|]/.test(normalized)
    || segments.some((segment) => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment))
    || !isWithinScope(normalized, [runRelative]) || pathKey(normalized) === pathKey(runRelative)) {
    throw new Error(`${label}는 현재 앱 실행 디렉터리 아래의 안전한 상대 파일 경로여야 합니다.`);
  }
  const workspace = path.resolve(root);
  const physicalWorkspace = fs.realpathSync(workspace);
  const runs = path.resolve(workspace, RUNS_PATH);
  const physicalRuns = fs.realpathSync(runs);
  if (!inside(physicalWorkspace, physicalRuns)) throw new Error('실행 기록 디렉터리의 링크가 작업 공간 밖을 가리킵니다.');
  const physicalRun = fs.realpathSync(path.resolve(workspace, runRelative));
  if (!inside(physicalRuns, physicalRun) || pathKey(physicalRuns) === pathKey(physicalRun)
    || !fs.statSync(physicalRun).isDirectory()) {
    throw new Error('현재 앱 실행의 실제 디렉터리가 실행 기록 범위를 벗어납니다.');
  }
  const filename = path.resolve(workspace, normalized);
  if (!inside(runs, filename)) throw new Error(`${label}가 실행 기록 경로 밖입니다.`);
  const physical = fs.realpathSync(filename);
  if (!inside(physicalRun, physical) || !inside(physicalWorkspace, physical)) {
    throw new Error(`${label}의 링크·junction이 현재 앱 실행 디렉터리 밖을 가리킵니다.`);
  }
  const stat = fs.statSync(physical);
  if (!stat.isFile()) throw new Error(`${label}는 실제 일반 파일이어야 합니다.`);
  return { relative: normalized, physical, stat };
}

function sameFile(left, right) {
  return pathKey(left.physical) === pathKey(right.physical)
    || (left.stat.ino !== 0 && left.stat.dev === right.stat.dev && left.stat.ino === right.stat.ino);
}

function readResult(root, file, task, phase) {
  const value = JSON.parse(fs.readFileSync(file.physical, 'utf8').replace(/^\uFEFF/, ''));
  return validateResult(root, value, { task, phase });
}

function importRequests(board, task, result, by, importedAt) {
  const ids = new Set(board.requests.map((request) => request.id));
  let count = board.requests.filter((request) => request.sourceTaskId === task.id).length;
  for (const request of result.requests) {
    let id;
    do { count += 1; id = `${task.id}-REQ-${count}`; } while (ids.has(id));
    ids.add(id);
    board.requests.push({ ...request, id, sourceTaskId: task.id, goalId: task.goalId,
      status: 'pending', createdAt: importedAt, importedBy: by, importedAt });
  }
}

function handoff(root, board, task, by) {
  assertReady(board, task);
  const other = board.tasks.find((candidate) => candidate.id !== task.id && candidate.status === 'active');
  if (other) throw new Error(`다른 제작 작업이 진행 중입니다: ${other.id}`);
  if (!['backlog', 'ready', 'blocked'].includes(task.status)) {
    throw new Error(`backlog·ready 또는 앱 도구 대기 작업만 인계할 수 있습니다: ${task.id} [${task.status}]`);
  }
  if (task.status === 'blocked' && task.runtime?.blockKind !== 'app') {
    throw new Error('앱 도구 대기 이외의 보류 작업은 달라진 전제를 retry에 먼저 기록해 주세요.');
  }
  const attempt = counter(task.runtime, 'attempt') + 1;
  const run = createRun(root, task.goalId);
  const baseline = captureBaseline(root, run, task);
  const runPath = relative(root, run.dir);
  const baselinePath = relative(root, baseline.manifestPath);
  const handedOffAt = now();
  if (task.status === 'backlog') transitionTask(board, task.id, 'ready');
  else if (task.status === 'blocked') {
    transitionTask(board, task.id, 'ready', {
      lastRetryReason: 'CLI에서 사용할 수 없었던 앱 도구를 Codex 앱에서 제공하여 이어받습니다.',
      retryAuthorizedBy: by, retryAuthorizedAt: handedOffAt,
    });
  }
  transitionTask(board, task.id, 'active', {
    executionSurface: 'app', runId: run.id, baselinePath, attempt,
    handoffBy: by, handedOffAt, blockKind: null, blockReason: null,
    producerResultPath: null, reviewResultPath: null,
  });
  const promptPath = `${runPath}/producer.prompt.txt`;
  fs.writeFileSync(path.join(run.dir, 'producer.prompt.txt'),
    formatTaskPrompt(board, task, 'producer', { runRelative: runPath, baselineRelative: baselinePath }),
    { encoding: 'utf8', flag: 'wx' });
  const producerExecution = resolveExecution(board, task, 'producer');
  const reviewerExecution = resolveExecution(board, task, 'reviewer');
  fs.writeFileSync(path.join(run.dir, 'requested-execution.json'), JSON.stringify({ producerExecution, reviewerExecution }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  writeBoard(root, board);
  return {
    producerExecution, reviewerExecution,
    command: 'handoff', taskId: task.id, goalId: task.goalId, status: task.status,
    executionSurface: 'app', runId: run.id, runPath, baselinePath, promptPath,
    producerResultPath: `${runPath}/producer.json`, reviewResultPath: `${runPath}/reviewer.json`,
    resultSchemaPath: 'scripts/studio/result.schema.json', handoffBy: by, handedOffAt,
  };
}

function report(root, board, task, args, by) {
  if (!['active', 'review'].includes(task.status) || task.runtime?.executionSurface !== 'app') {
    throw new Error('Codex 앱에 인계된 active·review 작업의 결과만 가져올 수 있습니다.');
  }
  assertReady(board, task);
  const producerFile = resultFile(root, args.producer, '--producer', task.runtime.runId);
  const producer = readResult(root, producerFile, task, 'producer');
  const alreadyInReview = task.status === 'review';
  if (alreadyInReview) {
    const recorded = resultFile(root, task.runtime.producerResultPath, '기록된 제작 결과', task.runtime.runId);
    if (!sameFile(producerFile, recorded)) throw new Error('검토 중인 작업에는 원장에 기록된 제작 결과를 지정해 주세요.');
    if (producer.outcome !== 'completed') throw new Error('검토 중인 제작 결과를 보류 결과로 교체할 수 없습니다.');
  }

  // Validate every supplied result before changing or saving the board.
  let reviewFile;
  let review;
  let reviewPasses;
  if (producer.outcome === 'completed') {
    reviewFile = resultFile(root, args.review, '--review', task.runtime.runId);
    if (pathKey(producerFile.relative) === pathKey(reviewFile.relative) || sameFile(producerFile, reviewFile)) {
      throw new Error('제작 결과와 독립 검토 결과는 서로 다른 실제 파일이어야 합니다.');
    }
    review = readResult(root, reviewFile, task, 'reviewer');
    reviewPasses = counter(task.runtime, 'reviewPasses') + 1;
  }
  const importedAt = now();
  if (!alreadyInReview) importRequests(board, task, producer, by, importedAt);
  const imported = { importedBy: by, importedAt, producerResultPath: producerFile.relative,
    producerSummary: producer.summary, producerImportedBy: by, producerImportedAt: importedAt };

  if (producer.outcome === 'blocked') {
    transitionTask(board, task.id, 'blocked', {
      ...imported, failure: producer.failure,
      blockKind: producer.requests.some((request) => request.blocking) ? 'dependency-request' : 'worker',
      blockReason: producer.summary,
    });
  } else {
    if (!alreadyInReview) transitionTask(board, task.id, 'review', imported);
    else task.runtime = { ...task.runtime, ...imported };
    const reviewed = { importedBy: by, importedAt, reviewPasses,
      reviewImportedBy: by, reviewImportedAt: importedAt };
    if (review.outcome === 'completed') {
      transitionTask(board, task.id, 'done', {
        ...reviewed, reviewResultPath: reviewFile.relative,
        evidence: review.evidence.map((item) => `${item.path} — ${item.claim}`),
        reviewSummary: review.summary, blockKind: null, blockReason: null,
      });
    } else if (review.outcome === 'needs_changes' && reviewPasses < board.settings.maxReviewPasses) {
      transitionTask(board, task.id, 'ready', {
        ...reviewed, lastReviewPath: reviewFile.relative, repairInstructions: review.issues,
        lastFailure: review.failure, blockKind: null, blockReason: null,
      });
    } else {
      transitionTask(board, task.id, 'blocked', {
        ...reviewed, lastReviewPath: reviewFile.relative,
        failure: review.failure, blockKind: 'review', blockReason: review.summary,
      });
    }
  }
  writeBoard(root, board);
  return {
    command: 'report', taskId: task.id, goalId: task.goalId, status: task.status,
    producerResultPath: producerFile.relative, reviewResultPath: reviewFile?.relative ?? null,
    importedBy: by, importedAt,
    reviewResponsibility: '독립 검토의 실제 수행 여부와 결과 JSON의 진위는 인수하시는 앱 총괄이 확인하셔야 합니다.',
  };
}

export function handleAppCommand(root, args) {
  if (!args || !['handoff', 'report'].includes(args.command)) throw new Error('앱 명령은 handoff 또는 report여야 합니다.');
  const taskId = required(args.task, '--task');
  const by = required(args.by, '--by 앱 총괄');
  const lock = acquireLock(root, { owner: `app-director:${by}:${args.command}:${taskId}`, goalId: 'APP' });
  try {
    const board = readBoard(root);
    const task = findTask(board, taskId);
    const result = args.command === 'handoff'
      ? handoff(root, board, task, by) : report(root, board, task, args, by);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    releaseLock(lock);
  }
}
