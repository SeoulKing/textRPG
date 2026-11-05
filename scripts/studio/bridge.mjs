import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BridgeRuntime } from './bridge-runtime.mjs';
import { safeDisplay } from './codex-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRECTORY = path.join(ROOT, '.runtime/studio');
const CONFIG = path.join(DIRECTORY, 'bridge-config.json');
const SECRETS = path.join(DIRECTORY, 'bridge-secrets.json');
const STATE = path.join(DIRECTORY, 'bridge-state.json');
const LOCK = path.join(DIRECTORY, 'bridge.lock.json');
const STOP = path.join(DIRECTORY, 'bridge-stop.json');
const now = () => new Date().toISOString();
const readJson = (filename, fallback) => {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
function writeJson(filename, value) {
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const temporary = filename + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, filename);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } }
function parse(argv) {
  const [command = 'help', ...rest] = argv; const result = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i].replace(/^--/, '');
    if (!['site', 'code', 'name'].includes(name) || !rest[i + 1] || result[name]) throw new Error('명령 옵션을 확인해 주세요.');
    result[name] = rest[i + 1];
  }
  return result;
}
function siteOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('사이트의 HTTPS 기본 주소를 입력해 주세요.');
  if (url.protocol !== 'https:') throw new Error('원격 연결에는 HTTPS 주소가 필요합니다.');
  return url.origin;
}
async function stdinJson() {
  if (process.stdin.isTTY) throw new Error('비밀 설정은 명령 인자가 아닌 표준 입력 JSON으로 전달해 주세요.');
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk; if (data.length > 65536) throw new Error('설정 입력이 너무 큽니다.');
    const end = data.indexOf('\n');
    if (end >= 0) { data = data.slice(0, end); break; }
  }
  return JSON.parse(data.replace(/^\uFEFF/, ''));
}
function protect(value) {
  if (process.platform !== 'win32') {
    throw new Error('현재 비밀 저장은 Windows DPAPI를 사용합니다. 다른 운영체제에서는 환경 변수를 사용해 주세요.');
  }
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(ROOT, 'scripts/studio/bridge-secrets.ps1'), '-Action', 'Protect'],
  { input: JSON.stringify(value), encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }).trim();
  writeJson(SECRETS, { version: 1, encrypted: output });
}
function unprotect() {
  if (process.platform !== 'win32') return {
    serviceToken: process.env.ARCANA_SITE_SERVICE_TOKEN, deviceToken: process.env.ARCANA_DEVICE_TOKEN,
  };
  const encrypted = readJson(SECRETS, null)?.encrypted;
  if (!encrypted) return { serviceToken: process.env.ARCANA_SITE_SERVICE_TOKEN };
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(ROOT, 'scripts/studio/bridge-secrets.ps1'), '-Action', 'Unprotect'],
  { input: encrypted, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
  return JSON.parse(output.replace(/^\uFEFF/, ''));
}
async function post(config, secrets, endpoint, body, { device = true, timeoutMs = 20000 } = {}) {
  if (!secrets.serviceToken) throw new Error('사이트 서비스 접근 설정이 필요합니다.');
  const headers = { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': 'Bearer ' + secrets.serviceToken };
  if (device) {
    if (!secrets.deviceToken) throw new Error('PC 기기 연결이 필요합니다.');
    headers.Authorization = 'Bearer ' + secrets.deviceToken;
  }
  const response = await fetch(config.site + endpoint, { method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { throw new Error('사이트가 올바른 API 응답을 반환하지 않았습니다. 로그인·게시 상태를 확인해 주세요.'); }
  if (!response.ok) {
    const error = new Error(safeDisplay(data.error ?? data.message ?? '사이트 요청이 거절되었습니다.'));
    error.authorizationFailure = response.status === 401 || response.status === 403; throw error;
  }
  return data;
}
function acquireBridgeLock() {
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const previous = readJson(LOCK, null);
  if (previous) {
    if (previous.host !== os.hostname() || alive(previous.pid)) throw new Error('PC 연결 프로그램이 이미 실행 중이거나 잠금 소유권을 확인할 수 없습니다.');
    fs.unlinkSync(LOCK);
  }
  const lock = { pid: process.pid, host: os.hostname(), token: crypto.randomUUID(), startedAt: now() };
  fs.writeFileSync(LOCK, JSON.stringify(lock), { flag: 'wx', mode: 0o600 });
  return lock;
}
function releaseBridgeLock(lock) { if (readJson(LOCK, null)?.token === lock.token) fs.unlinkSync(LOCK); }

async function start() {
  const config = readJson(CONFIG, null); const secrets = unprotect();
  if (!config?.connectionId || !secrets.deviceToken) throw new Error('웹의 PC 연결 코드로 pair를 먼저 진행해 주세요.');
  config.site = siteOrigin(config.site);
  const lock = acquireBridgeLock();
  if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
  const state = readJson(STATE, { processed: {}, updates: {}, messages: [], pendingTasks: [], departmentThreads: {} });
  state.processed ??= {}; state.updates ??= {}; state.messages ??= [];
  let revision = 0; let closing = false; let usageAt = 0; let lastFailure = ''; let backoff = 2000; let canReportShutdown = true;
  const saveState = () => writeJson(STATE, state);
  const updateCommand = (id, status, fields = {}) => {
    const value = { id, status, ...fields, revision: ++revision };
    state.processed[id] = { status, updatedAt: now(), result: fields.result ?? null, error: fields.error ?? null };
    state.updates[id] = value; saveState();
  };
  for (const [id, record] of Object.entries(state.processed)) {
    if (record.status === 'running') updateCommand(id, 'needs_attention', { error: 'PC 연결 프로그램이 중단되었습니다. 기록을 확인한 뒤 새 지시로 재개해 주세요.' });
  }
  const sendMessage = (message) => { state.messages.push(message); saveState(); };
  const runtime = new BridgeRuntime({ root: ROOT, state, saveState, sendMessage, updateCommand });
  const stopCommands = new Set();
  const stop = () => { closing = true; runtime.requestStop(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const inflight = new Set();
  try {
    console.log('아르카나 PC 연결 프로그램을 시작했습니다. ' + config.site);
    while (!closing) {
      if (fs.existsSync(STOP)) { stop(); break; }
      try {
        if (Date.now() - usageAt > 30000) {
          usageAt = Date.now();
          // Refresh is read-only; it never consumes a reset or starts a model turn.
          await runtime.refreshUsage();
        }
        const snapshot = runtime.snapshot();
        const updates = Object.values(state.updates).slice(0, 20);
        const messages = state.messages.slice(0, 30);
        await post(config, secrets, '/api/bridge/update', { connectionId: config.connectionId, snapshot,
          updates: updates.map(({ revision: unused, ...entry }) => entry), messages });
        for (const entry of updates) if (state.updates[entry.id]?.revision === entry.revision) delete state.updates[entry.id];
        const sent = new Set(messages.map((message) => message.id));
        state.messages = state.messages.filter((message) => !sent.has(message.id)); saveState();
        const response = await post(config, secrets, '/api/bridge/poll', { connectionId: config.connectionId });
        for (const command of response.commands ?? []) {
          if (state.processed[command.id]) {
            const record = state.processed[command.id];
            updateCommand(command.id, record.status, { result: record.result, error: record.error });
            continue;
          }
          if (closing) {
            updateCommand(command.id, 'needs_attention', { error: 'PC 연결 프로그램 종료로 실행하지 않았습니다. PC를 다시 연결한 뒤 새 지시로 진행해 주세요.' });
            continue;
          }
          updateCommand(command.id, 'running');
          if (command.type === 'stop_bridge') {
            stopCommands.add(command.id); stop();
            continue;
          }
          const task = runtime.handleCommand(command)
            .then((result) => updateCommand(command.id, result.status ?? 'completed', { result: result.result ?? '지시를 반영했습니다.' }))
            .catch((error) => {
              updateCommand(command.id, 'needs_attention', { error: safeDisplay(error.message) });
              sendMessage({ id: crypto.randomUUID(), departmentId: command.target ?? 'director', role: 'system',
                text: safeDisplay(error.message), commandId: command.id, createdAt: now() });
            })
            .finally(() => inflight.delete(task));
          inflight.add(task);
        }
        lastFailure = ''; backoff = 2000;
      } catch (error) {
        const fingerprint = safeDisplay(error.message);
        if (fingerprint !== lastFailure) { console.error('연결 상태: ' + fingerprint); lastFailure = fingerprint; }
        if (error.authorizationFailure) { canReportShutdown = false; throw error; }
        backoff = Math.min(backoff * 2, 30000);
      }
      // Sleep in short slices so stop does not wait through a long reconnect delay.
      const until = Date.now() + backoff;
      while (!closing && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (fs.existsSync(STOP)) stop();
      }
    }
  } finally {
    stop();
    try {
      // Finish shutdown locally before reporting success: an interrupted model writer must not survive this process.
      await runtime.close();
      await Promise.allSettled([...inflight]);
      for (const id of stopCommands) updateCommand(id, 'completed', {
        result: 'PC 연결 프로그램과 Codex 자식 프로세스를 종료했습니다. 다시 연결하려면 PC에서 수동으로 시작해 주세요.',
      });
      saveState();
      // The first final batch prioritizes the stop acknowledgement. Unsent records remain durable for manual restart.
      for (let batch = 0; canReportShutdown && batch < 3; batch += 1) {
        const updates = Object.values(state.updates)
          .sort((left, right) => Number(stopCommands.has(right.id)) - Number(stopCommands.has(left.id))).slice(0, 20);
        const messages = state.messages.slice(0, 30);
        try {
          await post(config, secrets, '/api/bridge/update', {
            connectionId: config.connectionId, snapshot: runtime.snapshot(),
            updates: updates.map(({ revision: unused, ...entry }) => entry), messages,
          }, { timeoutMs: 5000 });
          for (const entry of updates) if (state.updates[entry.id]?.revision === entry.revision) delete state.updates[entry.id];
          const sent = new Set(messages.map((message) => message.id));
          state.messages = state.messages.filter((message) => !sent.has(message.id));
          saveState();
          if (!Object.keys(state.updates).length && !state.messages.length) break;
        } catch (error) {
          console.error('종료 기록은 PC에 보존했습니다: ' + safeDisplay(error.message));
          break;
        }
      }
    } finally {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      releaseBridgeLock(lock);
      console.log('PC 연결 프로그램을 종료했습니다.');
    }
  }
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.command === 'configure') {
    const input = await stdinJson(); const site = siteOrigin(args.site ?? input.site);
    if (typeof input.serviceToken !== 'string' || input.serviceToken.length < 20) throw new Error('서비스 접근 설정을 확인해 주세요.');
    const config = readJson(CONFIG, {}); const secrets = unprotect();
    const sameSite = config.site === site;
    protect({ serviceToken: input.serviceToken, ...(sameSite && secrets.deviceToken ? { deviceToken: secrets.deviceToken } : {}) });
    writeJson(CONFIG, { site, ...(sameSite ? config : {}), deviceName: config.deviceName ?? os.hostname(), configuredAt: now() });
    console.log('서비스 접근 설정을 암호화하여 저장했습니다. 토큰은 출력하지 않습니다.');
  } else if (args.command === 'pair') {
    const config = readJson(CONFIG, {}); const selectedSite = siteOrigin(args.site ?? config.site);
    if (config.site && config.site !== selectedSite) throw new Error('설정된 사이트와 다릅니다. 새 사이트를 configure한 뒤 연결해 주세요.');
    config.site = selectedSite;
    const secrets = unprotect(); const pairingCode = String(args.code ?? '').trim();
    if (!/^[A-Za-z0-9-]{6,24}$/.test(pairingCode)) throw new Error('웹에서 발급한 PC 연결 코드를 입력해 주세요.');
    const deviceName = args.name ?? config.deviceName ?? os.hostname();
    const result = await post(config, secrets, '/api/bridge/pair', { pairingCode, deviceName }, { device: false });
    if (!result.connectionId || typeof result.deviceToken !== 'string') throw new Error('PC 연결 응답을 확인해 주세요.');
    protect({ serviceToken: secrets.serviceToken, deviceToken: result.deviceToken });
    writeJson(CONFIG, { site: config.site, connectionId: result.connectionId, deviceName, pairedAt: now() });
    console.log('PC를 개인 제작실에 연결했습니다. start-bridge.ps1로 백그라운드 실행하실 수 있습니다.');
  } else if (args.command === 'start') await start();
  else if (args.command === 'status') {
    const config = readJson(CONFIG, {}); const lock = readJson(LOCK, null);
    console.log(JSON.stringify({ configured: !!config.site, paired: !!config.connectionId, site: config.site ?? null,
      deviceName: config.deviceName ?? null, running: !!lock && lock.host === os.hostname() && alive(lock.pid),
      pid: lock?.pid ?? null, startedAt: lock?.startedAt ?? null }, null, 2));
  } else if (args.command === 'stop') {
    const lock = readJson(LOCK, null);
    if (!lock) { console.log('실행 중인 PC 연결 프로그램이 없습니다.'); return; }
    if (lock.host !== os.hostname()) throw new Error('다른 호스트의 연결 잠금은 변경할 수 없습니다.');
    if (!alive(lock.pid)) { fs.unlinkSync(LOCK); console.log('종료된 연결 프로그램의 잠금을 해제했습니다.'); return; }
    writeJson(STOP, { requestedAt: now(), pid: lock.pid });
    console.log('PC 연결 프로그램에 안전한 종료를 요청했습니다.');
  } else if (args.command === 'help') console.log('아르카나 PC 연결 프로그램\n'
    + 'configure --site <HTTPS주소> : stdin JSON {serviceToken}을 DPAPI로 저장합니다.\n'
    + 'pair --site <HTTPS주소> --code <웹 연결코드> [--name <PC이름>]\n'
    + 'start | status | stop\n비밀 토큰을 명령 인자나 공개 파일에 넣지 마세요.');
  else throw new Error('알 수 없는 연결 프로그램 명령입니다.');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('PC 연결 프로그램: ' + safeDisplay(error.message)); process.exitCode = 1; });
}
