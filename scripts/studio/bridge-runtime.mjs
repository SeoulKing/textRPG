import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CodexClient, safeDisplay } from './codex-client.mjs';
import { run, editBoard } from './studio.mjs';
import { readBoard, writeBoard, findGoal, findTask, acquireLock, releaseLock, validateBoard, lockStatus, clearStaleLock, selectTask } from './engine.mjs';
import { approvalDigest, assertGoalReady, assertTaskAuthorized } from './protocol.mjs';
import { resolveExecution, modelCatalog, setDepartmentDefault } from './model-policy.mjs';
import { createIntakeSchema, formatIntakePrompt, formatResearchPrompt, normalizeIntake } from './mission-intake.mjs';
import { derivePublicationIntent } from './publication-intent.mjs';
import { buildCollaborationSnapshot, recordCollaboration } from './collaboration.mjs';

const NAMES = { director: '제작 총괄', design: '게임 기획', narrative: '서사', world: '그래픽 디자인',
  character: '캐릭터 아트', development: '개발', quality: '통합·품질' };
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

export class BridgeRuntime extends EventEmitter {
  constructor({ root, state, saveState, sendMessage, updateCommand }) {
    super(); Object.assign(this, { root, state, saveState, sendMessage, updateCommand });
    this.client = new CodexClient({ root }); this.contexts = new Map(); this.workers = new Set();
    this.running = false; this.paused = state.runtimePaused === true; this.boundaryStop = false; this.bridgeStopping = false; this.runPromise = null;
    this.controller = null; this.activity = Array.isArray(state.activity) ? state.activity.slice(-100) : []; this.chatTail = Promise.resolve(); this.pendingEdits = [];
    this.state.collaborationQueue ??= []; this.state.modelSettingsQueue ??= []; this.state.intakeQueue ??= []; this.state.goalQueue ??= []; this.state.departmentHistory ??= {}; this.tickPromise = null;
    // OS uptime can be rounded to seconds. Never infer a reboot from a lock inside that margin.
    this.bootLowerBound = Date.now() - (os.uptime() + 2) * 1000;
    if (state.runningAutonomousGoal && !state.goalQueue.includes(state.runningAutonomousGoal)) state.goalQueue.push(state.runningAutonomousGoal);
    this.usageData = { status: 'unavailable', updatedAt: null };
    this.client.on('usage', (data) => { this.usageData = { ...data, status: 'ready', updatedAt: now() }; });
    this.client.on('notification', (event) => this.activityEvent(event));
    this.client.on('approval', (approval) => this.note(this.contexts.get(approval.threadId)?.departmentId ?? 'director',
      'approval', approval.reason, this.contexts.get(approval.threadId)?.taskId, { approval }));
    this.client.on('disconnected', (error) => {
      this.usageData = { ...this.usageData, status: 'error', error: safeDisplay(error.message) };
      this.note('director', 'error', error.message);
    });
  }

  note(departmentId, type, text, taskId = null, extra = {}) {
    this.activity.push({ id: uuid(), departmentId, type, text: safeDisplay(text), taskId, at: now(), ...extra });
    this.activity = this.activity.slice(-100); this.state.activity = this.activity; this.emit('change');
  }

  activityEvent({ method, params = {} }) {
    const context = this.contexts.get(params.threadId);
    if (!context) return;
    if (method === 'item/started' || method === 'item/completed') {
      const type = params.item?.type;
      if (type === 'reasoning' || type === 'agentMessage' || type === 'userMessage') return;
      const labels = { commandExecution: '명령 실행', fileChange: '파일 수정',
        webSearch: '자료 검색', mcpToolCall: '도구 호출', dynamicToolCall: '도구 호출',
        plan: '작업 계획', imageGeneration: '이미지 작업' };
      const action = (labels[type] ?? '작업 처리') + (method === 'item/started' ? ' 중' : ' 완료');
      context.currentAction = action;
      this.note(context.departmentId, method === 'item/started' ? 'action' : 'action_completed', action, context.taskId);
    }
  }

  async refreshUsage() {
    try {
      const data = await this.client.usage();
      const { rateLimits, rateLimitsByLimitId, rateLimitResetCredits } = data;
      this.usageData = { status: 'ready', updatedAt: now(), rateLimits, rateLimitsByLimitId, rateLimitResetCredits };
    } catch (error) { this.usageData = { ...this.usageData, status: 'error', error: safeDisplay(error.message) }; }
  }

  snapshot() {
    const board = readBoard(this.root);
    const recorded = new Set((board.collaborationEvents ?? []).map((event) => event.id));
    if (this.state.collaborationQueue.some((event) => recorded.has(event.id))) {
      this.state.collaborationQueue = this.state.collaborationQueue.filter((event) => !recorded.has(event.id)); this.saveState();
    }
    const { collaborationEvents: unusedEvents, completionReports: unusedCompletionReports, ...publicBoard } = board;
    const applied = new Set(board.tasks.map((task) => task.id));
    const pending = this.state.pendingTasks ?? [];
    if (pending.some((entry) => applied.has(entry.task.id))) {
      this.state.pendingTasks = pending.filter((entry) => !applied.has(entry.task.id));
      this.saveState();
    }
    const connectionLock = lockStatus(this.root);
    const activeTasks = [...this.workers].map(({ departmentId, taskId, phase, threadId, turnId, currentAction, execution }) =>
      ({ departmentId, taskId, phase, threadId: threadId ?? null, turnId: turnId ?? null, currentAction,
        model: execution.model, reasoningEffort: execution.reasoningEffort }));
    const primary = activeTasks[0];
    const departments = Object.entries(NAMES).map(([id, name]) => {
      const current = [...this.workers, ...this.contexts.values()].find((item) => item.departmentId === id);
      const task = !this.running && board.tasks.find((item) => item.goalId === connectionLock.goalId
        && (item.status === 'review' ? id === 'quality' : item.organization === id && item.status === 'active'));
      const execution = resolveExecution(board, { organization: id }, 'producer');
      const last = [...this.activity].reverse().find((item) => item.departmentId === id);
      return { id, name, activeTasks: activeTasks.filter((item) => item.departmentId === id), status: current ? 'working' : task && connectionLock.alive ? 'working' : 'idle',
        currentTaskId: current?.taskId ?? task?.id ?? null,
        currentAction: current?.currentAction ?? (task && connectionLock.alive ? '외부 실행기에서 작업 중' : '다음 작업 대기'),
        phase: current?.phase ?? null, model: current?.execution?.model ?? execution.model,
        reasoningEffort: current?.execution?.reasoningEffort ?? execution.reasoningEffort,
        defaultModel: execution.model, defaultReasoningEffort: execution.reasoningEffort, lastEventAt: last?.at ?? null };
    });
    return { updatedAt: now(), board: { ...publicBoard, goals: board.goals.map((goal) => ({ ...goal, approvalDigest: approvalDigest(goal) })) },
      departments, activity: this.activity, usage: this.usageData,
      collaboration: buildCollaborationSnapshot(board),
      modelSettings: { version: 1, catalog: modelCatalog(this.client.models), pending: this.state.modelSettingsQueue.map((entry) => ({
        id: entry.id, departmentId: entry.target, model: entry.payload.model, reasoningEffort: entry.payload.reasoningEffort,
      })) },
      intake: { latestGoalId: this.state.latestGoalId ?? null, pending: this.state.intakeQueue.map((entry) => ({
        goalId: entry.goalId, title: entry.title, status: entry.status,
        reason: entry.reason, sourceCommandId: entry.command.id,
      })) },
      approvals: [...this.client.approvals.values()].map((entry) => ({
        id: entry.requestId, requestId: entry.requestId,
        departmentId: this.contexts.get(entry.threadId)?.departmentId ?? 'director',
        kind: entry.kind, title: entry.kind === 'question' ? '사용자 답변 대기' : 'Codex 승인 대기',
        description: entry.reason, choices: entry.availableDecisions, questions: entry.questions,
        supported: entry.supported,
      })),
      runtime: { running: this.running, goalId: this.goalId ?? null, activeTasks, taskId: primary?.taskId ?? null,
        phase: primary?.phase ?? null, threadId: primary?.threadId ?? null,
        turnId: primary?.turnId ?? null, paused: this.paused, bridgeStopping: this.bridgeStopping,
        approvals: [...this.client.approvals.values()].map(({ rpcId, ...entry }) => entry) } };
  }

  async invoke({ prompt, schema, prefix, run: runInfo, deadline, signal, mode, execution, task, phase, goalId, studioWorkflow, images = [] }) {
    const departmentId = phase === 'reviewer' ? 'quality' : phase === 'director' ? 'director' : task.organization;
    const context = { departmentId, taskId: task?.id ?? null, phase, execution, currentAction: phase === 'reviewer' ? '독립 품질 검토 중' : phase === 'director' ? (schema === 'completion-director.schema.json' ? '부서 완료 보고와 목표 전체 확인 중' : '부서 협업 요청 조정 중') : '작업 준비 중' };
    fs.writeFileSync(path.join(runInfo.dir, prefix + '.prompt.txt'), prompt, 'utf8');
    fs.writeFileSync(path.join(runInfo.dir, prefix + '.execution.json'), JSON.stringify(execution, null, 2), 'utf8');
    this.note(departmentId, 'started', context.currentAction, context.taskId);
    this.workers.add(context);
    try {
      const result = await this.client.runTurn({ prompt, mode, execution, images,
        outputSchema: JSON.parse(fs.readFileSync(path.join(this.root, 'scripts/studio', schema), 'utf8')),
        deadline, signal, onStarted: ({ threadId, turnId }) => {
          Object.assign(context, { threadId, turnId }); this.contexts.set(threadId, context);
          if (context.phase === 'chat') {
            this.state.departmentThreads ??= {};
            this.state.departmentThreads[context.departmentId] = threadId; this.saveState();
          }
        } });
      const value = JSON.parse(result.text.replace(/^\uFEFF/, ''));
      const filename = path.join(runInfo.dir, prefix + '.json');
      fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', 'utf8');
      if (studioWorkflow !== 'autonomous-v1') this.sendMessage({ id: uuid(), departmentId, role: 'assistant',
        text: safeDisplay(value.summary ?? '작업 결과를 제출했습니다.', 12000), createdAt: now() });
      this.note(departmentId, 'submitted', value.summary ?? '작업 결과 제출', context.taskId);
      return { result: value, path: path.relative(this.root, filename).split(path.sep).join('/') };
    } finally {
      if (context.threadId) this.contexts.delete(context.threadId);
      this.workers.delete(context);
    }
  }

  async startRun(goalId, commandId = null) {
    if (this.bridgeStopping) throw new Error('PC 연결 프로그램이 종료 중입니다.');
    if (this.running) throw new Error('이미 목표를 진행 중입니다.');
    const board = readBoard(this.root); const goal = findGoal(board, goalId);
    assertGoalReady(board, goal);
    if (goal.status === 'done') throw new Error('이미 인수한 목표입니다.');
    if (lockStatus(this.root).locked) throw new Error('다른 총괄이 원장을 사용 중입니다.');
    this.running = true; this.paused = false; this.state.runtimePaused = false; this.boundaryStop = false; this.goalId = goalId;
    if (this.state.recoveryAttention?.goalId === goalId) delete this.state.recoveryAttention;
    if (goal.studioWorkflow === 'autonomous-v1') this.state.runningAutonomousGoal = goalId;
    this.state.goalQueue = this.state.goalQueue.filter((id) => id !== goalId); this.saveState();
    this.controller = new AbortController(); this.note('director', 'run_started', goal.title + ' 목표를 시작합니다.');
    this.runPromise = run({ goal: goalId }, { owner: 'web-bridge-director', signal: this.controller.signal,
      shouldPause: () => this.paused || this.boundaryStop, models: this.client.models,
      loadModels: () => this.client.connect(), probeProductionRoute: (task) => this.client.probeProductionRoute(task),
      onBoundary: async (currentBoard) => this.applyPendingTasks(currentBoard),
      invoke: (params) => this.invoke(params) })
      .then((result) => {
        const text = this.paused ? '다음 작업부터 일시정지했습니다.' : result?.message ?? '현재 가능한 작업 처리를 마쳤습니다.';
        this.note('director', this.paused ? 'paused' : 'run_finished', text);
        if (goal.studioWorkflow !== 'autonomous-v1') this.sendMessage({ id: uuid(), departmentId: 'director', role: 'assistant', text: safeDisplay(text, 4000), createdAt: now() });
      })
      .catch((error) => {
        if (!this.bridgeStopping && !this.paused && lockStatus(this.root).locked) {
          this.queueGoal(goalId); this.saveState();
        }
        this.note('director', 'error', error.message);
      })
      .finally(async () => {
        const wasBoundaryStop = this.boundaryStop;
        this.running = false;
        if (this.state.runningAutonomousGoal === goalId) { this.state.runningAutonomousGoal = null; this.saveState(); }
        const edits = this.pendingEdits.splice(0);
        for (const entry of edits) {
          try { this.applyEdit(entry.command); entry.resolve({ status: 'completed', result: '지시를 원장에 반영했습니다.' }); }
          catch (error) { entry.reject(error); }
        }
        this.boundaryStop = false;
        if (wasBoundaryStop && !this.paused && !this.bridgeStopping) {
          // Preserve the old goal behind the new instruction; never interrupt its writer or reviewer.
          if (!this.state.goalQueue.includes(goalId)) this.state.goalQueue.push(goalId);
          this.saveState();
        }
        await this.tick();
      });
    return { status: 'completed', result: '승인된 목표 실행을 시작했습니다.' };
  }

  queueGoal(goalId) {
    this.state.goalQueue = [goalId, ...this.state.goalQueue.filter((id) => id !== goalId)];
  }

  flushIntakes() {
    while (this.state.intakeQueue.length && !this.running && !this.bridgeStopping) {
      const entry = this.state.intakeQueue[0];
      if (lockStatus(this.root).locked) {
        entry.status = 'waiting_for_lock'; entry.reason = '다른 제작 작업이 원장을 사용 중입니다. 종료 후 자동 등록합니다.';
        this.saveState(); return;
      }
      let lock;
      try {
        lock = acquireLock(this.root, { owner: 'web-mission-intake', goalId: entry.goalId });
      } catch (error) {
        if (!lockStatus(this.root).locked) throw error;
        entry.status = 'waiting_for_lock'; entry.reason = '제작 원장 사용이 끝나기를 기다리고 있습니다.';
        this.saveState(); return;
      }
      let intake; let eligible; let failure;
      try {
        // Rebase the original planning response onto the latest board under the canonical lock.
        const board = readBoard(this.root);
        intake = normalizeIntake(board, entry.rawResult, entry.command, { replayQueued: true });
        if (intake.mode === 'new_goal') board.goals.push(intake.goal);
        for (const task of intake.tasks) if (!board.tasks.some((item) => item.id === task.id)) board.tasks.push(task);
        for (const decision of intake.decisions) if (!board.decisions.some((item) => item.id === decision.id)) board.decisions.push(decision);
        if (intake.tasks.length) {
          recordCollaboration(board, { id: 'registered-' + entry.command.id, goalId: intake.goal.id,
            kind: 'goal_registered', status: 'registered', fromDepartmentId: 'director', toDepartmentId: 'director',
            title: intake.mode === 'new_goal' ? '지시를 새 목표로 정리했습니다' : '관련 목표에 지시를 반영했습니다',
            summary: intake.goal.title, reason: safeDisplay(entry.command.text, 3000), sourceCommandIds: [entry.command.id] });
          for (const task of intake.tasks) recordCollaboration(board, { id: 'assigned-' + task.id, goalId: intake.goal.id,
            taskId: task.id, kind: 'assigned', status: task.status, fromDepartmentId: 'director', toDepartmentId: task.organization,
            title: '담당 부서에 작업을 배정했습니다', summary: task.title,
            reason: task.runtime?.blockReason ?? (task.dependsOn.length ? '선행 작업 결과를 받은 뒤 시작합니다.' : '완료 조건에 맞춰 제작을 시작할 수 있습니다.'),
            sourceCommandIds: [entry.command.id] });
        }
        validateBoard(board); writeBoard(this.root, board);
        eligible = board.tasks.some((task) => task.goalId === intake.goal.id
          && task.runtime?.sourceCommandId === entry.command.id && ['ready', 'backlog', 'review'].includes(task.status));
      } catch (error) { failure = error; }
      finally { releaseLock(lock); }
      // Only a failed board transaction rejects this intake. Notification failures must never dequeue another command.
      if (failure) {
        this.state.intakeQueue.shift(); this.saveState();
        this.updateCommand(entry.command.id, 'needs_attention', { error: safeDisplay(failure.message) });
        this.sendMessage({ id: uuid(), departmentId: 'director', role: 'system', text: safeDisplay(failure.message),
          commandId: entry.command.id, createdAt: now() });
        this.note('director', 'error', failure.message);
        continue;
      }
      this.state.latestGoalId = intake.goal.id;
      if (eligible) this.queueGoal(intake.goal.id);
      this.state.intakeQueue.shift(); this.saveState();
      const text = '목표 “' + intake.goal.title + '”을 원장에 등록했습니다. '
        + (eligible ? '부서별 선행 순서에 따라 진행합니다.' : '필요한 판단·인계 항목은 해당 작업에 표시했습니다.');
      this.updateCommand(entry.command.id, 'completed', { result: text });
      if (intake.goal.studioWorkflow !== 'autonomous-v1') this.sendMessage({ id: uuid(), departmentId: 'director', role: 'system', text,
        commandId: entry.command.id, createdAt: now() });
      this.note('director', 'goal_registered', text);
    }
  }
  recoverQueuedLock() {
    const goalId = this.state.runningAutonomousGoal;
    if (!goalId && !this.state.recoveryAttention) return;
    const lock = lockStatus(this.root);
    const clearAttention = () => {
      if (this.state.recoveryAttention) { delete this.state.recoveryAttention; this.saveState(); }
    };
    if (!goalId || !lock.locked) { clearAttention(); return; }
    const goal = readBoard(this.root).goals.find((item) => item.id === goalId);
    if (goal?.studioWorkflow !== 'autonomous-v1' || goal.status === 'done') { clearAttention(); return; }
    const sameOwner = lock.sameHost && lock.owner === 'web-bridge-director' && lock.goalId === goalId;
    const started = Date.parse(lock.startedAt);
    let reason;
    if (sameOwner && lock.alive === false && typeof lock.token === 'string' && lock.token.length
      && Number.isFinite(started) && started < this.bootLowerBound) {
      try {
        clearStaleLock(this.root, lock.token);
        clearAttention();
        this.note('director', 'recovery', '이전 PC 부팅에서 종료된 제작 실행의 잠금을 해제했습니다. 저장된 제출물부터 이어받습니다.');
        return;
      } catch { reason = '재연결 중 잠금 소유권이 바뀌었거나 해제할 수 없습니다.'; }
    } else if (sameOwner && lock.alive === false) {
      reason = '이전 제작 총괄은 종료됐지만 재부팅 여부와 남은 작업 프로세스의 종료를 확인할 수 없습니다.';
    } else {
      reason = '남아 있는 원장 잠금의 소유자와 모든 작업 프로세스의 종료를 확인할 수 없습니다.';
    }
    if (Number.isInteger(lock.pid)) reason += ' 잠금 PID ' + lock.pid + '.';
    reason += ' PC에서 이전 작업 종료를 확인하고 종료된 원장 잠금만 해제해 주세요. 연결기가 저장된 결과부터 이어받습니다.';
    const previous = this.state.recoveryAttention;
    if (previous?.goalId !== goalId || previous.reason !== reason) {
      this.state.recoveryAttention = { goalId, reason, updatedAt: now() };
      this.saveState();
    }
  }

  async tick() {
    if (this.tickPromise) return this.tickPromise;
    if (this.bridgeStopping || this.running) return;
    this.tickPromise = (async () => {
      this.recoverQueuedLock();
      this.flushCollaborationRecords();
      this.flushModelSettings();
      this.flushIntakes();
      if (this.paused || this.bridgeStopping || lockStatus(this.root).locked) return;
      const board = readBoard(this.root);
      // An external app completion has no running CLI loop to notify its director. Pick it up once here.
      let queued = false;
      for (const task of board.tasks) {
        if (task.status !== 'review' || !task.runtime?.manualVisualReview || task.runtime.executionSurface !== 'app'
          || this.state.goalQueue.includes(task.goalId)) continue;
        const goal = board.goals.find((item) => item.id === task.goalId);
        if (goal?.studioWorkflow !== 'autonomous-v1' || goal.status === 'done' || goal.supervision?.status === 'blocked'
          || board.tasks.some((item) => item.goalId === goal.id && item.status === 'active')) continue;
        try { assertGoalReady(board, goal); } catch { continue; }
        this.state.goalQueue.push(goal.id); queued = true;
      }
      for (const report of board.completionReports ?? []) {
        if (!['pending', 'processing'].includes(report.status) || this.state.goalQueue.includes(report.goalId)) continue;
        if ((board.completionReports ?? []).some((item) => item.goalId === report.goalId && item.status === 'blocked')) continue;
        const task = board.tasks.find((item) => item.id === report.taskId);
        const goal = board.goals.find((item) => item.id === report.goalId);
        if (task?.runtime?.executionSurface !== 'app' || !goal || goal.status === 'done' || goal.supervision?.status === 'blocked' || board.tasks.some((item) => item.goalId === goal.id && item.status === 'active')) continue;
        try { assertGoalReady(board, goal); } catch { continue; }
        this.state.goalQueue.push(goal.id); queued = true;
      }
      if (queued) this.saveState();
      for (const goalId of [...this.state.goalQueue]) {
        const goal = board.goals.find((item) => item.id === goalId);
        const active = board.tasks.filter((item) => item.goalId === goalId && item.status === 'active');
        const recovering = goal?.studioWorkflow === 'autonomous-v1' && this.state.runningAutonomousGoal === goalId
          && active.every((item) => item.runtime?.executionSurface === 'cli');
        if (!goal || goal.status === 'done' || (active.length && !recovering)) {
          this.state.goalQueue = this.state.goalQueue.filter((id) => id !== goalId); this.saveState();
          continue;
        }
        const pendingCompletion = (board.completionReports ?? []).some((report) => report.goalId === goalId && ['pending', 'processing'].includes(report.status));
        if (!selectTask(board, goalId) && !pendingCompletion && !recovering) {
          const waiting = board.tasks.some((task) => task.goalId === goalId && ['ready', 'backlog', 'review'].includes(task.status));
          if (!waiting) { this.state.goalQueue = this.state.goalQueue.filter((id) => id !== goalId); this.saveState(); }
          continue;
        }
        try { assertGoalReady(board, goal); }
        catch {
          this.state.goalQueue = this.state.goalQueue.filter((id) => id !== goalId); this.saveState(); continue;
        }
        try { await this.startRun(goalId); }
        catch (error) {
          // A concurrent external owner may have acquired the lock after the check. Keep this goal queued.
          if (!lockStatus(this.root).locked) {
            this.state.goalQueue = this.state.goalQueue.filter((id) => id !== goalId); this.saveState();
            this.note('director', 'error', error.message);
          }
        }
        break;
      }
    })();
    try { await this.tickPromise; } finally { this.tickPromise = null; }
  }
  applyPendingTasks(board) {
    this.applyCollaborationRecords(board);
    const pending = this.state.pendingTasks ?? [];
    for (const entry of pending) {
      if (board.tasks.some((task) => task.id === entry.task.id)) continue;
      assertGoalReady(board, findGoal(board, entry.task.goalId));
      assertTaskAuthorized(board, entry.task);
      const copy = structuredClone(board); copy.tasks.push(entry.task); validateBoard(copy);
      board.tasks.push(entry.task);
    }
    this.saveState();
  }

  queueCollaborationRecord(event) {
    this.state.collaborationQueue.push({ id: uuid(), at: now(), ...event }); this.saveState();
  }

  applyCollaborationRecords(board) {
    const applied = new Set((board.collaborationEvents ?? []).map((event) => event.id));
    for (const event of this.state.collaborationQueue) {
      if (applied.has(event.id)) continue;
      const task = board.tasks.find((item) => item.id === event.taskId && item.goalId === event.goalId);
      if (!task) continue;
      task.runtime ??= {};
      task.runtime.sourceCommandIds = [...new Set([...(task.runtime.sourceCommandIds ?? []), ...(event.sourceCommandIds ?? [])])];
      recordCollaboration(board, event);
    }
  }

  flushCollaborationRecords() {
    if (!this.state.collaborationQueue.length || this.running || lockStatus(this.root).locked) return;
    let lock;
    try { lock = acquireLock(this.root, { owner: 'web-collaboration-records', goalId: this.state.collaborationQueue[0].goalId }); }
    catch (error) { if (lockStatus(this.root).locked) return; throw error; }
    try {
      const board = readBoard(this.root);
      const missing = this.state.collaborationQueue.filter((event) => !board.tasks.some((task) => task.id === event.taskId && task.goalId === event.goalId));
      if (missing.length) {
        const ids = new Set(missing.map((event) => event.id));
        this.state.collaborationUnmatched = [...(this.state.collaborationUnmatched ?? []), ...missing].slice(-50);
        this.state.collaborationQueue = this.state.collaborationQueue.filter((event) => !ids.has(event.id)); this.saveState();
        this.note('director', 'trace_unmatched', '전달한 추가 지시의 원래 작업이 없어 해당 기록을 PC에 따로 보관했습니다.');
      }
      this.applyCollaborationRecords(board); validateBoard(board); writeBoard(this.root, board);
      const applied = new Set((board.collaborationEvents ?? []).map((event) => event.id));
      this.state.collaborationQueue = this.state.collaborationQueue.filter((event) => !applied.has(event.id)); this.saveState();
    } finally { releaseLock(lock); }
  }
  flushModelSettings() {
    if (!this.state.modelSettingsQueue.length || this.running || lockStatus(this.root).locked) return;
    const lock = acquireLock(this.root, { owner: 'web-model-settings', goalId: 'MODEL-SETTINGS' });
    try {
      for (const command of [...this.state.modelSettingsQueue]) {
        try {
          this.client.assertModel(command.payload);
          const board = readBoard(this.root);
          setDepartmentDefault(board, command.target, command.payload, Object.keys(NAMES));
          writeBoard(this.root, board);
          const result = NAMES[command.target] + ' 기본 설정을 ' + command.payload.model + ' / ' + command.payload.reasoningEffort + '로 저장했습니다. 다음 새 실행부터 적용합니다.';
          this.updateCommand(command.id, 'completed', { result });
          this.note(command.target, 'model_settings', result);
        } catch (error) {
          this.updateCommand(command.id, 'needs_attention', { error: safeDisplay(error.message) });
          this.note(command.target, 'error', error.message);
        }
        this.state.modelSettingsQueue = this.state.modelSettingsQueue.filter((item) => item.id !== command.id);
        this.saveState();
      }
    } finally { releaseLock(lock); }
  }

  applyEdit(command) {
    const args = { by: '웹 사용자 ' + (command.actorUserId ?? 'owner'), goal: command.goalId, sourceCommandId: command.id };
    if (command.type === 'approve_goal') editBoard({ ...args, command: 'approve', digest: command.payload?.digest });
    else if (command.type === 'accept_goal') editBoard({ ...args, command: 'accept', reason: command.payload?.reason ?? command.text });
    else if (command.type === 'retry_task') editBoard({ ...args, command: 'retry', task: command.taskId, reason: command.payload?.reason ?? command.text });
    else if (command.type === 'resolve_decision') {
      const decision = readBoard(this.root).decisions.find((item) => item.id === command.payload?.decisionId);
      editBoard({ ...args, command: 'resolve_decision', decisionId: command.payload?.decisionId, reason: command.payload?.resolution ?? command.text });
      if (decision?.sourceCompletionReportId || ['app-handoff', 'run-interruption'].includes(decision?.type)) { this.queueGoal(command.goalId); this.saveState(); }
    }
    else throw new Error('허용하지 않은 원장 동작입니다.');
  }

  requestStop() {
    if (this.bridgeStopping) return;
    this.bridgeStopping = true; this.paused = true; this.controller?.abort();
    this.note('director', 'bridge_stopping', 'PC 연결 프로그램을 완전히 종료합니다. 다시 연결하려면 PC에서 수동으로 시작해 주세요.');
  }

  async handleCommand(command) {
    if (this.bridgeStopping) throw new Error('PC 연결 프로그램이 종료 중입니다. 다시 연결한 뒤 지시해 주세요.');
    if (command.type === 'set_department_model') {
      if (!Object.hasOwn(NAMES, command.target)) throw new Error('설정할 부서를 확인해 주세요.');
      await this.client.connect();
      this.client.assertModel(command.payload ?? {});
      if (!this.state.modelSettingsQueue.some((entry) => entry.id === command.id)) {
        this.state.modelSettingsQueue.push({ id: command.id, target: command.target,
          payload: { model: command.payload.model, reasoningEffort: command.payload.reasoningEffort } });
        this.saveState();
      }
      if (this.running) this.boundaryStop = true;
      this.flushCollaborationRecords();
      this.flushModelSettings();
      if (this.state.modelSettingsQueue.some((entry) => entry.id === command.id)) {
        return { status: 'running', result: '설정을 접수했습니다. 현재 제작·검토가 끝나면 적용합니다.' };
      }
      const result = this.state.processed?.[command.id];
      if (result?.status === 'needs_attention') throw new Error(result.error || '모델 설정을 저장하지 못했습니다.');
      return { status: result?.status ?? 'completed', result: result?.result ?? '부서별 기본 설정을 저장했습니다.' };
    }
    if (command.type === 'message') {
      if (command.payload?.research === true && (command.target !== 'design' || command.payload.expectedTurnId)) {
        throw new Error('기술 연구는 게임 기획 부서 대화에서 요청해 주세요.');
      }
      const current = [...this.workers].find((worker) => worker.departmentId === command.target && worker.turnId === command.payload?.expectedTurnId);
      if (command.target !== 'director' && command.payload?.expectedTurnId &&
        current?.departmentId === command.target && current.turnId === command.payload.expectedTurnId) {
        try {
          await this.client.steer(current.threadId, current.turnId,
            '웹 사용자님의 추가 지시입니다. 기존 목표·검증·미술·게시 승인 범위를 유지해 주세요.\n' + command.text);
          this.queueCollaborationRecord({ goalId: this.goalId, taskId: current.taskId, kind: 'assigned', status: 'forwarded',
            fromDepartmentId: 'director', toDepartmentId: current.departmentId,
            title: '진행 중인 담당자에게 추가 지시를 전달했습니다', summary: safeDisplay(command.text, 3000),
            reason: '화면에서 선택한 진행 중 작업의 turn ID를 확인하고 추가 지시를 전달했습니다.', sourceCommandIds: [command.id] });
          return { status: 'completed', result: '진행 중인 작업에 추가 지시를 전달했습니다.' };
        } catch (error) {
          const definitelyNotApplied = error.noActiveTurn || (typeof error.rpcCode === 'number'
            && /no active turn|not active|not in progress|expectedTurnId|turn.{0,30}mismatch|active turn.{0,30}match|in.flight turn/i.test(error.message));
          if (!definitelyNotApplied) throw error;
          this.note(command.target, 'queued', '직전 작업이 끝나 추가 지시를 부서 대화로 이어받습니다.');
        }
      }
      const work = this.chatTail.then(() => this.chat(command));
      this.chatTail = work.catch(() => {}); return work;
    }
    if (command.type === 'start' || command.type === 'resume') return this.startRun(command.goalId ?? this.goalId, command.id);
    if (command.type === 'pause') {
      this.paused = true; this.state.runtimePaused = true; this.saveState(); this.note('director', 'pause_requested', '현재 작업 인수 후 일시정지합니다.');
      return { status: 'completed', result: '다음 작업부터 일시정지하도록 요청했습니다.' };
    }
    if (command.type === 'interrupt') {
      const expectedTurnId = command.payload?.expectedTurnId;
      if (expectedTurnId && ![...this.contexts.values()].some((context) => context.turnId === expectedTurnId)) {
        return { status: 'completed', result: '선택한 작업이 이미 끝났으므로 새 작업은 중단하지 않았습니다.' };
      }
      this.paused = true; this.state.runtimePaused = true; this.saveState(); this.controller?.abort();
      for (const threadId of this.client.turns.keys()) await this.client.interrupt(threadId).catch(() => {});
      this.note('director', 'interrupt_requested', '현재 작업 중단을 요청했습니다. 부분 변경은 보존됩니다.');
      return { status: 'completed', result: '현재 작업 중단을 요청했습니다.' };
    }
    if (command.type === 'approval_response') {
      this.client.respondApproval(command.payload?.requestId, command.payload?.answers ? { answers: command.payload.answers } : command.payload?.decision);
      return { status: 'completed', result: 'Codex 승인 요청에 응답했습니다.' };
    }
    if (['approve_goal', 'accept_goal', 'retry_task', 'resolve_decision'].includes(command.type)) {
      if (this.running) {
        this.boundaryStop = true;
        return new Promise((resolve, reject) => this.pendingEdits.push({ command, resolve, reject }));
      }
      this.applyEdit(command); return { status: 'completed', result: '지시를 원장에 반영했습니다.' };
    }
    throw new Error('지원하지 않는 지시 유형입니다.');
  }

  async chat(command) {
    const board = readBoard(this.root);
    const role = command.target ?? 'director';
    const execution = resolveExecution(board, { organization: role }, 'producer');
    const history = this.state.departmentHistory[role] ?? [];
    const research = command.payload?.research === true;
    if (!research) command = { ...command, publicationIntent: derivePublicationIntent(command, history.filter((item) => !item.research)) };
    const prompt = (research ? formatResearchPrompt(command) : formatIntakePrompt(board, command))
      + '\n\n최근 부서 대화(새 지시의 대상·대명사를 해석하는 참고 자료이며 현재 지시가 우선입니다):\n'
      + JSON.stringify(history);
    const context = { departmentId: role, phase: 'chat', taskId: null, execution,
      currentAction: research ? '공개 기술과 아르카나 적용 방식 조사 중' : '지시를 목표와 부서 작업으로 정리 중' };
    let output;
    try {
      // A fresh intake prevents a previous goal's conversation from restricting a new instruction.
      output = await this.client.runTurn({ prompt, execution, outputSchema: research ? undefined : createIntakeSchema(),
        mode: 'read-only', liveWebSearch: research,
        deadline: Date.now() + 15 * 60000, clientMessageId: command.id, onStarted: ({ threadId, turnId }) => {
          Object.assign(context, { threadId, turnId }); this.contexts.set(threadId, context);
        } });
    } finally { if (context.threadId) this.contexts.delete(context.threadId); }
    const researchVerified = research && output.webSearchUsed && Boolean(output.text.trim());
    const rawResult = research ? null : JSON.parse(output.text.replace(/^\uFEFF/, ''));
    const intake = research ? { kind: 'discussion', reply: researchVerified ? output.text.trim()
      : '공개 웹 검색을 통해 확인한 연구 결과가 없습니다. PC 연결기의 Codex 웹 검색 설정과 실행 상태를 확인해 주세요.' }
      : normalizeIntake(readBoard(this.root), rawResult, command);
    this.state.departmentHistory[role] = [...history,
      { role: 'user', text: command.text, commandId: command.id, actorUserId: command.actorUserId, ...(research ? { research } : {}) },
      { role: 'assistant', text: safeDisplay(intake.reply, 8000), goalId: intake.goal?.id ?? null, ...(research ? { research } : {}) }].slice(-8);
    this.saveState();
    if (intake.kind === 'discussion') {
      this.sendMessage({ id: uuid(), departmentId: role, role: 'assistant', text: safeDisplay(intake.reply, 16000),
        commandId: command.id, createdAt: now() });
      if (research) return researchVerified ? { status: 'completed', result: '기획 부서에서 기술 연구 결과를 받았습니다.' }
        : { status: 'needs_attention', result: intake.reply };
      return { status: 'completed', result: '부서 답변을 받았습니다.' };
    }
    const existing = this.state.intakeQueue.find((entry) => entry.command.id === command.id);
    if (!existing) this.state.intakeQueue.push({ command: structuredClone(command), rawResult,
      goalId: intake.goal.id, title: intake.goal.title, status: 'queued',
      reason: this.running ? '진행 중인 제작·검토를 마친 뒤 등록하여 우선 진행합니다.' : '목표 원장에 등록을 준비하고 있습니다.' });
    // The user's clear new instruction resumes its own mission, without cancelling the previous one.
    this.paused = false; this.state.runtimePaused = false;
    if (this.running) this.boundaryStop = true;
    this.saveState();
    if (intake.goal.studioWorkflow !== 'autonomous-v1') this.sendMessage({ id: uuid(), departmentId: role, role: 'assistant', text: safeDisplay(intake.reply, 16000),
      commandId: command.id, createdAt: now() });
    await this.tick();
    const pending = this.state.intakeQueue.find((entry) => entry.command.id === command.id);
    if (pending) return { status: 'completed', result: '지시를 목표로 정리했습니다. ' + pending.reason };
    const record = this.state.processed?.[command.id];
    if (record?.status === 'needs_attention') return { status: 'needs_attention', result: record.error };
    return { status: 'completed', result: '지시를 목표와 부서 작업으로 등록했습니다.' };
  }
  async close() {
    this.paused = true; this.controller?.abort();
    await this.client.close();
    await this.runPromise?.catch(() => {});
  }
}
