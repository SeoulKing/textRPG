import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CodexClient, safeDisplay } from './codex-client.mjs';
import { run, editBoard } from './studio.mjs';
import { readBoard, writeBoard, findGoal, findTask, acquireLock, releaseLock, validateBoard, lockStatus } from './engine.mjs';
import { approvalDigest, assertGoalReady, assertTaskAuthorized } from './protocol.mjs';
import { resolveExecution } from './model-policy.mjs';

const NAMES = { director: '제작 총괄', design: '게임 기획', narrative: '서사', world: '월드 제작',
  character: '캐릭터 아트', development: '개발', quality: '통합·품질' };
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

export class BridgeRuntime extends EventEmitter {
  constructor({ root, state, saveState, sendMessage, updateCommand }) {
    super(); Object.assign(this, { root, state, saveState, sendMessage, updateCommand });
    this.client = new CodexClient({ root }); this.contexts = new Map(); this.active = null;
    this.running = false; this.paused = false; this.boundaryStop = false; this.bridgeStopping = false; this.runPromise = null;
    this.controller = null; this.activity = Array.isArray(state.activity) ? state.activity.slice(-100) : []; this.chatTail = Promise.resolve(); this.pendingEdits = [];
    this.usageData = { status: 'unavailable', updatedAt: null };
    this.client.on('usage', (data) => { this.usageData = { ...data, status: 'ready', updatedAt: now() }; });
    this.client.on('notification', (event) => this.activityEvent(event));
    this.client.on('approval', (approval) => this.note(this.contexts.get(approval.threadId)?.departmentId ?? 'director',
      'approval', approval.reason, this.active?.taskId, { approval }));
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
    const applied = new Set(board.tasks.map((task) => task.id));
    const pending = this.state.pendingTasks ?? [];
    if (pending.some((entry) => applied.has(entry.task.id))) {
      this.state.pendingTasks = pending.filter((entry) => !applied.has(entry.task.id));
      this.saveState();
    }
    const connectionLock = lockStatus(this.root);
    const departments = Object.entries(NAMES).map(([id, name]) => {
      const current = [...this.contexts.values()].find((item) => item.departmentId === id);
      const task = board.tasks.find((item) => (item.status === 'review' ? id === 'quality' : item.organization === id && item.status === 'active'));
      const execution = resolveExecution(board, { organization: id }, 'producer');
      const last = [...this.activity].reverse().find((item) => item.departmentId === id);
      return { id, name, status: current ? 'working' : task && connectionLock.alive ? 'working' : 'idle',
        currentTaskId: current?.taskId ?? task?.id ?? null,
        currentAction: current?.currentAction ?? (task && connectionLock.alive ? '외부 실행기에서 작업 중' : '다음 작업 대기'),
        phase: current?.phase ?? null, model: current?.execution?.model ?? execution.model,
        reasoningEffort: current?.execution?.reasoningEffort ?? execution.reasoningEffort, lastEventAt: last?.at ?? null };
    });
    return { updatedAt: now(), board: { ...board, goals: board.goals.map((goal) => ({ ...goal, approvalDigest: approvalDigest(goal) })) },
      departments, activity: this.activity, usage: this.usageData,
      approvals: [...this.client.approvals.values()].map((entry) => ({
        id: entry.requestId, requestId: entry.requestId,
        departmentId: this.contexts.get(entry.threadId)?.departmentId ?? 'director',
        kind: entry.kind, title: entry.kind === 'question' ? '사용자 답변 대기' : 'Codex 승인 대기',
        description: entry.reason, choices: entry.availableDecisions, questions: entry.questions,
        supported: entry.supported,
      })),
      runtime: { running: this.running, goalId: this.goalId ?? null, taskId: this.active?.taskId ?? null,
        phase: this.active?.phase ?? null, threadId: this.active?.threadId ?? null,
        turnId: this.active?.turnId ?? null, paused: this.paused, bridgeStopping: this.bridgeStopping,
        approvals: [...this.client.approvals.values()].map(({ rpcId, ...entry }) => entry) } };
  }

  async invoke({ prompt, schema, prefix, run: runInfo, deadline, signal, mode, execution, task, phase, goalId }) {
    const departmentId = phase === 'reviewer' ? 'quality' : phase === 'director' ? 'director' : task.organization;
    const context = { departmentId, taskId: task?.id ?? null, phase, execution, currentAction: phase === 'reviewer' ? '독립 품질 검토 중' : '작업 준비 중' };
    this.active = context;
    fs.writeFileSync(path.join(runInfo.dir, prefix + '.prompt.txt'), prompt, 'utf8');
    fs.writeFileSync(path.join(runInfo.dir, prefix + '.execution.json'), JSON.stringify(execution, null, 2), 'utf8');
    this.note(departmentId, 'started', context.currentAction, context.taskId);
    try {
      const result = await this.client.runTurn({ prompt, mode, execution,
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
      this.sendMessage({ id: uuid(), departmentId, role: 'assistant',
        text: safeDisplay(value.summary ?? '작업 결과를 제출했습니다.', 12000), createdAt: now() });
      this.note(departmentId, 'submitted', value.summary ?? '작업 결과 제출', context.taskId);
      return { result: value, path: path.relative(this.root, filename).split(path.sep).join('/') };
    } finally {
      if (context.threadId) this.contexts.delete(context.threadId);
      if (this.active === context) this.active = null;
    }
  }

  async startRun(goalId, commandId = null) {
    if (this.bridgeStopping) throw new Error('PC 연결 프로그램이 종료 중입니다.');
    if (this.running) throw new Error('이미 목표를 진행 중입니다.');
    const board = readBoard(this.root); const goal = findGoal(board, goalId);
    assertGoalReady(board, goal);
    if (goal.status === 'done') throw new Error('이미 인수한 목표입니다.');
    const lock = lockStatus(this.root);
    if (lock.locked) throw new Error('다른 총괄이 원장을 사용 중입니다.');
    this.running = true; this.paused = false; this.boundaryStop = false; this.goalId = goalId;
    this.controller = new AbortController(); this.note('director', 'run_started', goal.title + ' 목표를 시작합니다.');
    this.runPromise = run({ goal: goalId }, { owner: 'web-bridge-director', signal: this.controller.signal,
      shouldPause: () => this.paused || this.boundaryStop,
      onBoundary: async (currentBoard) => this.applyPendingTasks(currentBoard),
      invoke: (params) => this.invoke(params) })
      .then(() => {
        this.note('director', this.paused ? 'paused' : 'run_finished',
          this.paused ? '다음 작업부터 일시정지했습니다.' : '현재 가능한 작업 처리를 마쳤습니다.');
      })
      .catch((error) => this.note('director', 'error', error.message))
      .finally(async () => {
        this.running = false; this.active = null;
        const edits = this.pendingEdits.splice(0);
        for (const entry of edits) {
          try { this.applyEdit(entry.command); entry.resolve({ status: 'completed', result: '지시를 원장에 반영했습니다.' }); }
          catch (error) { entry.reject(error); }
        }
        const restart = this.boundaryStop && !this.paused && edits.length;
        this.boundaryStop = false;
        if (restart) await this.startRun(goalId).catch((error) => this.note('director', 'error', error.message));
      });
    return { status: 'completed', result: '승인된 목표 실행을 시작했습니다.' };
  }

  applyPendingTasks(board) {
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

  applyEdit(command) {
    const args = { by: '웹 사용자 ' + (command.actorUserId ?? 'owner'), goal: command.goalId };
    if (command.type === 'approve_goal') editBoard({ ...args, command: 'approve', digest: command.payload?.digest });
    else if (command.type === 'accept_goal') editBoard({ ...args, command: 'accept', reason: command.payload?.reason ?? command.text });
    else if (command.type === 'retry_task') editBoard({ ...args, command: 'retry', task: command.taskId, reason: command.payload?.reason ?? command.text });
    else if (command.type === 'resolve_decision') editBoard({ ...args, command: 'resolve_decision',
      decisionId: command.payload?.decisionId, reason: command.payload?.resolution ?? command.text });
    else throw new Error('허용하지 않은 원장 동작입니다.');
  }

  requestStop() {
    if (this.bridgeStopping) return;
    this.bridgeStopping = true; this.paused = true; this.controller?.abort();
    this.note('director', 'bridge_stopping', 'PC 연결 프로그램을 완전히 종료합니다. 다시 연결하려면 PC에서 수동으로 시작해 주세요.');
  }

  async handleCommand(command) {
    if (this.bridgeStopping) throw new Error('PC 연결 프로그램이 종료 중입니다. 다시 연결한 뒤 지시해 주세요.');
    if (command.type === 'message') {
      const current = this.active;
      if (current?.departmentId === command.target && current.turnId) {
        try {
          await this.client.steer(current.threadId, current.turnId,
            '웹 사용자님의 추가 지시입니다. 기존 목표·검증·미술·게시 승인 범위를 유지해 주세요.\n' + command.text);
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
      this.paused = true; this.note('director', 'pause_requested', '현재 작업 인수 후 일시정지합니다.');
      return { status: 'completed', result: '다음 작업부터 일시정지하도록 요청했습니다.' };
    }
    if (command.type === 'interrupt') {
      this.paused = true; this.controller?.abort();
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
    const goal = board.goals.find((item) => item.id === command.goalId)
      ?? board.goals.find((item) => item.status === 'active')
      ?? board.goals.find((item) => item.status !== 'done');
    const workerSchema = JSON.parse(fs.readFileSync(path.join(this.root, 'scripts/studio/result.schema.json'), 'utf8'));
    const request = structuredClone(workerSchema.properties.requests.items);
    const outputSchema = { type: 'object', additionalProperties: false, required: ['reply', 'execute', 'tasks'],
      properties: { reply: { type: 'string' }, execute: { type: 'boolean' }, tasks: { type: 'array', maxItems: 8, items: request } } };
    const prompt = [
      '아르카나 ' + (NAMES[role] ?? '총괄') + ' 담당자로 사용자님과 대화해 주세요. 항상 존댓말로 답하세요.',
      '이 단계는 읽기 전용 기획/상담입니다. 파일·원장·승인을 직접 수정하거나 테스트·게임·브라우저·빌드를 실행하지 마세요.',
      'AGENTS.md와 docs/studio/README.md의 관련 규칙을 따르세요. .env·개인 저장·자격 증명을 읽거나 출력하지 마세요.',
      '사용자가 실제 작업을 명확히 지시하고 목표가 승인 상태라면 execute:true와 구현할 tasks를 제안하세요.',
      'tasks는 승인된 목표 범위 안에서 구체적인 파일·하위 디렉터리, 완료 조건, 담당 조직을 지정하세요.',
      '질문·논의·작업 제안 요청이면 execute:false와 tasks:[]로 답하세요. 목표 미승인 또는 권한 부족이면 필요한 판단을 설명하고 실행하지 마세요.',
      '추가 에이전트를 생성하지 마세요. 새 작업의 blocking은 false, surface는 실제 필요한 위치로 설정하세요.',
      '현재 목표 데이터:\n' + JSON.stringify(goal ?? null),
      '현재 작업 목록:\n' + JSON.stringify(board.tasks.map(({ id, goalId, title, status, organization }) => ({ id, goalId, title, status, organization }))),
      '사용자님의 메시지:\n' + command.text,
    ].join('\n\n');
    const context = { departmentId: role, phase: 'chat', taskId: null, execution, currentAction: '지시를 확인하고 답변 작성 중' };
    let output;
    try {
      output = await this.client.runTurn({ prompt, execution, outputSchema, threadId: this.state.departmentThreads?.[role] ?? null, mode: 'read-only',
        deadline: Date.now() + 15 * 60000, clientMessageId: command.id, onStarted: ({ threadId, turnId }) => {
          Object.assign(context, { threadId, turnId }); this.contexts.set(threadId, context);
          if (context.phase === 'chat') {
            this.state.departmentThreads ??= {};
            this.state.departmentThreads[context.departmentId] = threadId; this.saveState();
          }
        } });
    } finally { if (context.threadId) this.contexts.delete(context.threadId); }
    const result = JSON.parse(output.text);
    if (typeof result.reply !== 'string' || typeof result.execute !== 'boolean' || !Array.isArray(result.tasks) || result.tasks.length > 8) {
      throw new Error('부서 응답의 작업 계약이 올바르지 않습니다.');
    }
    this.sendMessage({ id: uuid(), departmentId: role, role: 'assistant', text: safeDisplay(result.reply, 16000),
      commandId: command.id, createdAt: now() });
    if (result.execute && result.tasks.length) {
      if (!goal) throw new Error('실행할 목표를 먼저 선택해 주세요.');
      assertGoalReady(board, goal);
      const proposed = result.tasks.map((item, index) => ({
        id: 'WEB-' + command.id.replaceAll('-', '').slice(0, 16) + '-' + (index + 1),
        goalId: goal.id, title: item.title, playerChange: item.playerChange, organization: item.organization,
        status: 'ready', priority: 1, dependsOn: item.dependsOn, scope: item.scope, capabilities: item.capabilities,
        checks: item.checks, acceptance: item.acceptance, surface: item.surface, runtime: { sourceCommandId: command.id },
      }));
      const candidate = structuredClone(board);
      for (const task of proposed) { assertTaskAuthorized(candidate, task); candidate.tasks.push(task); }
      validateBoard(candidate);
      this.state.pendingTasks ??= [];
      for (const task of proposed) this.state.pendingTasks.push({ commandId: command.id, task });
      this.saveState();
      if (!this.running) {
        const lock = acquireLock(this.root, { owner: 'web-directive', goalId: goal.id });
        try { const current = readBoard(this.root); this.applyPendingTasks(current); writeBoard(this.root, current); }
        finally { releaseLock(lock); }
        await this.startRun(goal.id);
      }
      return { status: 'completed', result: proposed.length + '개 작업을 승인 범위 안에서 배정했습니다.' };
    }
    return { status: 'completed', result: '부서 답변을 받았습니다.' };
  }

  async close() {
    this.paused = true; this.controller?.abort();
    await this.client.close();
    await this.runPromise?.catch(() => {});
  }
}
