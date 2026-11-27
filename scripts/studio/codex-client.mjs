import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const file = (name) => { try { return fs.statSync(name).isFile(); } catch { return false; } };
function projectTool(root, task) {
  const method = task.productionMethod;
  const project = path.join(root, 'godot-arcana');
  const configPath = path.join(project, 'project.godot');
  if (!file(configPath)) throw new Error('이 작업 공간에 아르카나 project.godot이 없습니다.');
  const config = fs.readFileSync(configPath, 'utf8');
  const version = config.match(/config\/features=PackedStringArray\("(\d+\.\d+)"/)?.[1];
  if (!version || !/config\/name="[^"]*아르카나/.test(config)) throw new Error('아르카나 프로젝트 이름과 Godot 버전을 확인할 수 없습니다.');
  if (method === 'pixelpen' && (!config.includes('res://addons/net.yarvis.pixel_pen/plugin.cfg') || !file(path.join(project, 'addons/net.yarvis.pixel_pen/classes/pixel_pen_project.gd')))) throw new Error('현재 작업 프로젝트의 PixelPen 플러그인과 편집 API가 필요합니다.');
  return { method, project, version };
}

export async function probeLocalProductionRoute(root, task) {
  const method = task.productionMethod;
  try {
    if (!['blender', 'godot', 'pixelpen'].includes(method)) throw new Error('작업의 제작 도구와 지원하는 실행 방식이 지정되지 않았습니다.');
    const { project, version } = projectTool(root, task);
    let executable, expected;
    if (method === 'blender') {
      const runtime = JSON.parse(fs.readFileSync(path.join(root, '.runtime/blender/runtime.json'), 'utf8'));
      executable = fs.realpathSync(path.resolve(root, runtime.executable));
      const rel = path.relative(fs.realpathSync(path.join(root, '.runtime/blender')), executable);
      if (path.isAbsolute(rel) || rel.startsWith('..') || !/^blender(?:\.exe)?$/i.test(path.basename(executable))) throw new Error('프로젝트 Blender 배포본을 찾을 수 없습니다.');
      expected = 'Blender ' + runtime.version;
    } else {
      const runtime = path.join(root, '.runtime/godot');
      const candidates = fs.readdirSync(runtime).map((name) => ({ name, match: /^Godot_v(\d+\.\d+)\.(\d+)-stable_(?:win64_console\.exe|linux\.x86_64)$/.exec(name) }))
        .filter((item) => item.match?.[1] === version).sort((a, b) => Number(b.match[2]) - Number(a.match[2]));
      if (!candidates.length) throw new Error('프로젝트에 맞는 Godot ' + version + ' 실행 파일이 필요합니다.');
      executable = path.join(runtime, candidates[0].name); expected = version + '.' + candidates[0].match[2] + '.';
    }
    const { stdout } = await runFile(executable, ['--version'], { cwd: project, windowsHide: true, timeout: 6000, maxBuffer: 32768 });
    if (!stdout.trimStart().startsWith(expected)) throw new Error('제작 도구의 실제 버전이 프로젝트 배포본과 다릅니다.');
    return { available: true, method, reason: method + ' CLI와 아르카나 프로젝트를 확인했습니다.', executable, project };
  } catch (error) {
    return { available: false, method: method ?? null, reason: safeDisplay(error.message, 450) };
  }
}

export function turnInput(prompt, images = []) {
  if (!Array.isArray(images) || images.some((name) => typeof name !== 'string' || !path.isAbsolute(name) || !file(name))) throw new Error('실제 로컬 이미지 파일의 절대 경로가 필요합니다.');
  return [{ type: 'text', text: prompt }, ...images.map((name) => ({ type: 'localImage', path: name }))];
}

export function safeDisplay(value, limit = 1200) {
  return String(value ?? '').replace(/(Bearer\s+)[^\s"']+/gi, '$1[비공개]')
    .replace(/\b(?:sk-|sk-proj-)[A-Za-z0-9_-]+/g, '[비공개]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[비공개]')
    .slice(0, limit);
}

function interrupted(message = '사용자 중단 또는 실행 시간 한도에 도달했습니다.') {
  const error = new Error(message); error.interrupted = true; return error;
}

export class CodexClient extends EventEmitter {
  constructor({ root, executable = process.platform === 'win32' ? 'codex.exe' : 'codex' }) {
    super(); this.root = root; this.executable = executable; this.sequence = 0;
    this.requests = new Map(); this.turns = new Map(); this.approvals = new Map(); this.models = [];
    this.child = null; this.starting = null; this.closed = false;
  }

  async connect() {
    if (this.closed || this.disconnected) throw new Error('Codex 연결이 종료되었습니다. 실행 환경을 확인하고 PC 연결 프로그램을 다시 시작해 주세요.');
    if (this.starting) return this.starting;
    this.starting = this.initialize();
    try { await this.starting; } catch (error) { await this.close(); this.starting = null; error.executionFailure = true; throw error; }
  }

  async initialize() {
    if (this.closed) throw new Error('종료한 Codex 연결은 다시 사용할 수 없습니다.');
    const child = spawn(this.executable, ['app-server', '--config', 'agents.max_threads=1'],
      { cwd: this.root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {}); // CLI diagnostics may contain credentials; never forward them.
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line.length > 4 * 1024 * 1024) return;
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && !message.method) {
        const pending = this.requests.get(String(message.id));
        if (!pending) return;
        this.requests.delete(String(message.id)); clearTimeout(pending.timer);
        if (message.error) {
          const error = new Error(safeDisplay(message.error.message || 'Codex 요청이 거절되었습니다.'));
          error.executionFailure = true; error.rpcCode = message.error.code; pending.reject(error);
        } else pending.resolve(message.result);
      } else if (message.method && message.id !== undefined) this.serverRequest(message);
      else if (message.method) this.notification(message);
    });
    const failed = (error) => {
      const failure = new Error(safeDisplay(error?.message || 'Codex 연결이 종료되었습니다.'));
      failure.executionFailure = true; this.disconnected = true;
      for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(failure); }
      this.requests.clear();
      for (const active of this.turns.values()) active.reject(failure);
      this.turns.clear(); this.approvals.clear(); if (!this.closed) this.emit('disconnected', failure);
    };
    child.once('error', failed);
    child.once('exit', (code) => failed(new Error('Codex 연결 종료 코드: ' + code)));
    await this.request('initialize', { clientInfo: { name: 'arcana_production_desk', title: '아르카나 제작실', version: '1.0.0' } });
    this.notify('initialized', {});
    let cursor;
    do {
      const page = await this.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
      this.models.push(...(page.data ?? [])); cursor = page.nextCursor;
    } while (cursor);
    this.emit('connected');
  }

  request(method, params = {}, timeout = 30000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin.writable) { reject(new Error('Codex 연결이 준비되지 않았습니다.')); return; }
      const timer = setTimeout(() => {
        this.requests.delete(String(id));
        const error = new Error('Codex 요청 응답 대기 시간이 지났습니다: ' + method);
        error.executionFailure = true; reject(error);
      }, timeout);
      this.requests.set(String(id), { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  notify(method, params = {}) {
    if (this.child?.stdin.writable) this.child.stdin.write(JSON.stringify({ method, params }) + '\n');
  }

  notification(message) {
    const { method, params = {} } = message;
    if (method === 'account/rateLimits/updated') this.emit('usage', params);
    if (method === 'serverRequest/resolved') this.approvals.delete(String(params.requestId));
    const active = this.turns.get(params.threadId);
    if (active) {
      if (method === 'turn/started') { active.turnId = params.turn?.id; active.onStarted?.(active.turnId); }
      if (method === 'item/agentMessage/delta') {
        active.texts.set(params.itemId, (active.texts.get(params.itemId) ?? '') + String(params.delta ?? ''));
      }
      if (method === 'item/completed' && params.item?.type === 'agentMessage') {
        active.texts.set(params.item.id, String(params.item.text ?? ''));
        if (params.item.phase === 'final_answer' || params.item.phase == null) active.finalText = String(params.item.text ?? '');
      }
      if (method === 'item/completed' && params.item?.type === 'webSearch') active.webSearchUsed = true;
      if (method === 'turn/completed') {
        if (!active.turnId || active.turnId === params.turn?.id) {
          this.turns.delete(params.threadId);
          if (params.turn?.status === 'interrupted') active.reject(interrupted());
          else if (params.turn?.status === 'failed') {
            const error = new Error(safeDisplay(params.turn?.error?.message || 'Codex 작업이 실패했습니다.'));
            error.executionFailure = true; active.reject(error);
          } else active.resolve({ threadId: params.threadId, turnId: params.turn?.id,
            text: active.finalText ?? [...active.texts.values()].at(-1) ?? '', turn: params.turn,
            webSearchUsed: active.webSearchUsed === true });
        }
      }
    }
    this.emit('notification', message);
  }

  serverRequest(message) {
    const { id, method, params = {} } = message;
    const inputRequest = method === 'item/tool/requestUserInput';
    const simpleRequest = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method);
    const hasSecret = inputRequest && (params.questions ?? []).some((question) => question.isSecret);
    const supported = simpleRequest || (inputRequest && !hasSecret);
    const allowed = ['accept', 'acceptForSession', 'decline', 'cancel'];
    const available = Array.isArray(params.availableDecisions)
      ? params.availableDecisions.filter((choice) => typeof choice === 'string' && allowed.includes(choice))
      : ['accept', 'decline', 'cancel'];
    const record = { requestId: String(id), rpcId: id, method, threadId: params.threadId,
      turnId: params.turnId, itemId: params.itemId, supported, kind: inputRequest ? 'question' : 'permission',
      reason: safeDisplay(params.reason || params.command || (inputRequest ? '사용자님의 답변이 필요합니다.' : 'Codex의 추가 승인이 필요합니다.')),
      availableDecisions: simpleRequest ? available : [],
      questions: inputRequest && !hasSecret ? (params.questions ?? []).map((question) => ({
        id: question.id, header: safeDisplay(question.header, 100), question: safeDisplay(question.question),
        isOther: !!question.isOther, options: (question.options ?? []).map((option) => ({
          label: safeDisplay(option.label, 200), description: safeDisplay(option.description, 500),
        })),
      })) : [] };
    this.approvals.set(String(id), record); this.emit('approval', record);
    if (!supported) this.emit('notice', { text: hasSecret
      ? '비밀 정보를 요구하는 질문은 PC에서 직접 처리해 주세요.'
      : '현재 웹에서 지원하지 않는 입력 요청입니다. 현재 작업을 중단한 뒤 확인해 주세요.', requestId: String(id) });
  }

  respondApproval(requestId, response) {
    const request = this.approvals.get(String(requestId));
    if (!request) throw new Error('이미 종료되었거나 없는 승인 요청입니다.');
    if (!request.supported) throw new Error('이 입력 요청은 PC에서 직접 처리하거나 작업을 중단해 주세요.');
    let result;
    if (request.kind === 'question') {
      const answers = response?.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('질문의 답변을 입력해 주세요.');
      const ids = new Set(request.questions.map((question) => question.id));
      if (Object.keys(answers).some((id) => !ids.has(id))) throw new Error('알 수 없는 질문에 대한 답변입니다.');
      for (const question of request.questions) {
        const values = answers[question.id]?.answers;
        if (!Array.isArray(values) || !values.length || values.length > 10
          || values.some((value) => typeof value !== 'string' || !value.trim() || value.length > 8000)) {
          throw new Error('모든 질문에 올바른 답변을 입력해 주세요.');
        }
      }
      result = { answers };
    } else {
      if (typeof response !== 'string' || !request.availableDecisions.includes(response)) throw new Error('허용되지 않은 승인 응답입니다.');
      result = { decision: response };
    }
    this.child.stdin.write(JSON.stringify({ id: request.rpcId, result }) + '\n');
    this.approvals.delete(String(requestId));
  }
  assertModel(execution) {
    const model = this.models.find((item) => item.model === execution.model || item.id === execution.model);
    if (!model) throw new Error('현재 계정에서 설정한 모델을 사용할 수 없습니다: ' + execution.model);
    const supported = model.supportedReasoningEfforts ?? [];
    if (supported.length && !supported.some((item) => (item.reasoningEffort ?? item.effort) === execution.reasoningEffort)) {
      throw new Error('현재 모델에서 설정한 추론 강도를 사용할 수 없습니다: ' + execution.reasoningEffort);
    }
  }

  async probeProductionRoute(task) {
    const method = task.productionMethod;
    let detail = '등록된 도구에서 해당 프로젝트를 확인하지 못했습니다.';
    let threadId;
    try {
      await this.connect();
      const { project, version } = projectTool(this.root, task);
      const thread = await this.request('thread/start', { cwd: this.root, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never' });
      threadId = thread.thread?.id;
      if (!threadId) throw new Error('도구 목록을 조회할 로컬 세션이 없습니다.');
      let cursor;
      do {
        const inventory = await this.request('mcpServerStatus/list', { threadId, detail: 'toolsAndAuthOnly', limit: 100, ...(cursor ? { cursor } : {}) });
        for (const server of inventory.data ?? []) {
          const tools = server.tools ?? {};
          const tool = method === 'blender' ? 'get_scene_info' : 'session_manage';
          if (!Object.hasOwn(tools, tool) || (method === 'blender' ? !Object.hasOwn(tools, 'execute_blender_code')
            : !['godot', 'pixelpen'].includes(method) || !Object.hasOwn(tools, 'scene_manage') || (method === 'pixelpen' && !Object.hasOwn(tools, 'script_manage')))) continue;
          const params = { threadId, server: server.name, tool, arguments: method === 'blender' ? {} : { op: 'list' } };
          if (server.environmentId) params.environmentId = server.environmentId;
          const response = await this.request('mcpServer/tool/call', params);
          if (response.isError) continue;
          const bodies = [response.structuredContent, ...(response.content ?? []).flatMap((item) => {
            if (item.type !== 'text') return [];
            try { return [JSON.parse(item.text)]; } catch { return []; }
          })].filter(Boolean);
          for (const body of bodies) {
            if (method === 'blender') {
              const blend = body.filepath ?? body.scene?.filepath ?? body.result?.filepath;
              if (typeof blend !== 'string' || !file(blend)) continue;
              const real = fs.realpathSync(blend);
              const rel = path.relative(fs.realpathSync(this.root), real).split(path.sep).join('/');
              if (path.isAbsolute(rel) || rel.startsWith('..') || ![...task.scope.read, ...task.scope.write].some((name) => rel === name || rel.startsWith(name + '/'))) continue;
              return { available: true, method, reason: '등록된 Blender MCP에서 작업 범위의 편집 원본을 확인했습니다.', project: real, server: server.name };
            }
            const sessions = body.sessions ?? body.result?.sessions ?? body.data?.sessions;
            for (const session of Array.isArray(sessions) ? sessions : []) {
              if (!session.session_id || !session.project_path || !String(session.godot_version).startsWith(version + '.')) continue;
              let actual; try { actual = fs.realpathSync(session.project_path); } catch { continue; }
              if (path.relative(fs.realpathSync(project), actual) === '') return { available: true, method, reason: '등록된 Godot MCP와 해당 프로젝트 편집기 세션을 확인했습니다.', project, sessionId: session.session_id, server: server.name };
            }
          }
        }
        cursor = inventory.nextCursor;
      } while (cursor);
    } catch (error) { detail = safeDisplay(error.message, 240); }
    finally { if (threadId) await this.request('thread/unsubscribe', { threadId }).catch(() => {}); }
    const local = await probeLocalProductionRoute(this.root, task);
    return local.available ? local : { ...local, reason: detail + ' 로컬 경로: ' + local.reason };
  }

  async runTurn({ prompt, execution, mode = 'read-only', outputSchema, threadId = null, images = [],
    signal, deadline = Date.now() + 90 * 60000, onStarted, clientMessageId, liveWebSearch = false }) {
    const input = turnInput(prompt, images);
    await this.connect(); this.assertModel(execution);
    if (images.length && !this.models.find((item) => (item.model ?? item.id) === execution.model)?.inputModalities?.includes('image')) throw new Error('선택한 모델의 실제 이미지 입력 지원이 확인되지 않았습니다.');
    if (this.turns.size >= 4) throw new Error('동시 작업 한도 4개에 도달했습니다.');
    if (signal?.aborted || deadline <= Date.now()) throw interrupted();
    let thread;
    if (threadId) thread = await this.request('thread/resume', { threadId, cwd: this.root,
      model: execution.model, sandbox: mode, approvalPolicy: mode === 'read-only' ? 'never' : 'on-request' });
    else thread = await this.request('thread/start', { cwd: this.root, model: execution.model,
      sandbox: mode, approvalPolicy: mode === 'read-only' ? 'never' : 'on-request',
      config: { model_reasoning_effort: execution.reasoningEffort, 'agents.max_threads': 1,
        ...(liveWebSearch ? { web_search: 'live' } : {}) }, ephemeral: false });
    const id = thread.thread?.id ?? threadId;
    if (!id || this.turns.has(id)) throw new Error('대화 스레드 상태를 확인해 주세요.');
    let finish;
    const completed = new Promise((resolve, reject) => {
      finish = { resolve, reject, texts: new Map(), turnId: null, onStarted: (turnId) => onStarted?.({ threadId: id, turnId }) };
      this.turns.set(id, finish);
    });
    // Attach a rejection handler before starting, since a transport can fail immediately.
    completed.catch(() => {});
    let cancelling = false;
    const cancel = () => {
      if (cancelling) return; cancelling = true;
      void (async () => {
        try { await this.interrupt(id); } catch { /* Termination fallback follows. */ }
        if (!this.turns.has(id)) return;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!this.turns.has(id)) return;
        // Do not release the repository lock while a writer may still run.
        await this.close();
        finish.reject(interrupted()); this.turns.delete(id);
      })();
    };
    const timer = setTimeout(cancel, Math.max(1, deadline - Date.now()));
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const started = await this.request('turn/start', { threadId: id, input,
        model: execution.model, effort: execution.reasoningEffort,
        ...(outputSchema ? { outputSchema } : {}),
        ...(clientMessageId ? { clientUserMessageId: clientMessageId } : {}) });
      finish.turnId ??= started.turn?.id;
      onStarted?.({ threadId: id, turnId: finish.turnId });
      return await completed;
    } catch (error) {
      if (this.turns.has(id)) {
        // A lost turn/start response can leave an unknown writer running.
        // Close the entire local server and confirm its exit before releasing the repository lock.
        await this.close();
        this.turns.delete(id);
      }
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      for (const [key, request] of this.approvals) if (request.threadId === id) this.approvals.delete(key);
    }
  }

  async steer(threadId, turnId, text) {
    if (!this.turns.has(threadId)) {
      const error = new Error('진행 중인 대화가 아닙니다.'); error.noActiveTurn = true; throw error;
    }
    return this.request('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text }] });
  }

  async interrupt(threadId) {
    const active = this.turns.get(threadId);
    if (!active?.turnId) return;
    await this.request('turn/interrupt', { threadId, turnId: active.turnId }, 10000);
  }

  async usage() { await this.connect(); return this.request('account/rateLimits/read'); }

  async close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      const child = this.child;
      if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
      for (const id of this.turns.keys()) await this.interrupt(id).catch(() => {});
      await new Promise((resolve) => {
        let finished = false;
        const done = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
        child.once('exit', done); child.once('close', done);
        const timer = setTimeout(() => {
          if (process.platform === 'win32' && child.pid) {
            execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
              { windowsHide: true, timeout: 5000 }, (error) => {
                if (error) { try { child.kill('SIGKILL'); } catch { /* Hold the lock until actual exit. */ } }
              });
          } else {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
          }
        }, 1500);
        child.stdin.end();
        if (child.exitCode !== null || child.signalCode !== null) done();
      });
    })();
    return this.closing;
  }
}
