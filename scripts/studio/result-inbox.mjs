import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { collaborationEvidence } from './collaboration.mjs';
import { safeDisplay } from './codex-client.mjs';
import { readBoard } from './engine.mjs';

const MAX_PREVIEW_BYTES = 240 * 1024;
const commandIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const clean = (s, max) => safeDisplay(s, max).trim();

export function inboxResults(board, recoveryAttention = null) {
  const cards = [];
  for (const goal of board.goals) {
    if (goal.studioWorkflow !== 'autonomous-v1' || !goal.sourceInstruction) continue;
    const recovery = recoveryAttention?.goalId === goal.id ? recoveryAttention : null;
    const tasks = board.tasks.filter(t => t.goalId === goal.id);
    const report = board.completionReports?.find(r => r.id === goal.supervision?.reportId);
    const decision = report?.decision;
    const complete = report?.status === 'processed' && decision?.action === 'ready_for_acceptance'
      && tasks.length > 0 && tasks.every(t => t.status === 'done');
    const problems = (board.decisions ?? []).filter(d => d.goalId === goal.id && d.status === 'pending' && d.blocking !== false);
    const stranded = tasks.filter(t => t.status === 'blocked' && t.runtime?.blockReason && t.runtime.blockKind !== 'dependency-request');
    const reason = [...new Set([recovery?.reason, ...problems.map(d => d.recommendation || d.title),
      ...(goal.supervision?.status === 'blocked' ? [goal.supervision.summary] : []),
      ...stranded.map(t => t.runtime.blockReason)].filter(Boolean))].join('\n');
    if (!complete) {
      if (!reason) continue;
      const stillWorking = tasks.some(t => t.status === 'active' || t.status === 'review');
      const canProceed = tasks.some(t => ['ready','backlog'].includes(t.status) &&
        t.dependsOn.every(id => board.tasks.some(s => s.id === id && s.status === 'done')));
      if (!recovery && goal.supervision?.status !== 'blocked' && (stillWorking || canProceed)) continue;
    }

    const sources = [goal.sourceInstruction, ...tasks.map(t => t.runtime?.sourceInstruction)];
    const commands = [...new Set(sources.filter(s => s && s.actorUserId === goal.sourceInstruction.actorUserId)
      .map(s => s.commandId).filter(id => commandIdPattern.test(id)))];
    const evidence = complete ? collaborationEvidence(decision.acceptanceEvidence.flatMap(entry => entry.evidence)) : [];
    const previews = complete ? (decision.previews ?? []).filter(p =>
      ['before','after','result'].includes(p.role) && /^[a-f0-9]{64}$/i.test(p.sha256)
      && collaborationEvidence([p]).length && tasks.some(t =>
        [...(t.runtime?.reviewEvidence ?? []), ...(t.runtime?.producerEvidence ?? [])].some(e => e.path === p.path))) : [];
    const times = [recovery?.updatedAt, goal.sourceInstruction.receivedAt, goal.supervision?.updatedAt, report?.processedAt,
      ...tasks.map(t => t.updatedAt), ...problems.map(p => p.createdAt)].filter(v => Number.isFinite(Date.parse(v)));
    const updatedAt = new Date(Math.max(...times.map(v => Date.parse(v)), 0)).toISOString();
    const body = {goalId: goal.id, status: complete ? 'completed' : 'needs_attention',
      title: clean(goal.title, 200), summary: clean(complete ? decision.summary : reason, 2400),
      checks: complete ? decision.acceptanceEvidence.map(e => clean(e.criterion, 400)).slice(0, 20) : [],
      unverified: complete ? (decision.unverified ?? []).map(v => clean(v, 400)).slice(0, 20) : [],
      evidence: evidence.filter(e => e.path.length <= 680 && e.summary.trim()).slice(0, 20), updatedAt,
      ...(complete ? {} : {exception: clean(reason, 1800)})};
    for (const commandId of commands) {
      const revision = crypto.createHash('sha256').update(JSON.stringify([body, previews])).digest('hex');
      cards.push({commandId, revision, body: {...body, commandId}, previews});
    }
  }
  return cards;
}

// Only the director's selected, reviewed image bytes can leave the PC. Re-encoding removes source metadata.
async function mobilePreview(root, selected) {
  if (!/\.(png|jpe?g|webp)$/i.test(selected.path)) throw new Error('이미지 형식');
  const workspace = await fs.realpath(root);
  const file = await fs.realpath(path.resolve(workspace, selected.path));
  if (path.relative(workspace, file).split(path.sep).join('/') !== selected.path) throw new Error('원본 경로');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 40 * 1024 * 1024) throw new Error('원본 크기');
  const bytes = await fs.readFile(file);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== selected.sha256) throw new Error('검토 이후 파일 변경');
  const {default: sharp} = await import('sharp');
  const input = sharp(bytes, {limitInputPixels: 48_000_000, failOn: 'error'});
  if (!['png','jpeg','webp'].includes((await input.metadata()).format)) throw new Error('실제 이미지 형식');
  for (const [width, quality] of [[1280,84],[960,72],[640,60],[400,50]]) {
    const data = await input.clone().rotate().resize({width, height:width, fit:'inside', withoutEnlargement:true})
      .webp({quality}).toBuffer();
    if (data.length <= MAX_PREVIEW_BYTES) return {role:selected.role, caption:clean(selected.caption, 200),
      mime:'image/webp', data:data.toString('base64')};
  }
  throw new Error('미리보기 크기');
}

export function createResultDelivery({root, state, saveState, send}) {
  let stamp = '';
  let cards = [];
  const attempts = new Map();
  return async function deliverOne() {
    const stat = await fs.stat(path.join(root,'docs/studio/board.json'), {bigint:true});
    const key = stat.mtimeNs + ':' + stat.size + ':' + (state.recoveryAttention?.updatedAt ?? '');
    if (key !== stamp) { cards = inboxResults(readBoard(root), state.recoveryAttention); stamp = key; }
    state.resultReceipts ??= {};
    const card = cards.find(c => state.resultReceipts[c.commandId] !== c.revision
      && (attempts.get(c.revision)?.next ?? 0) <= Date.now());
    if (!card) return;
    const spoolDir = path.join(root, '.runtime/studio/result-outbox');
    const spoolFile = path.join(spoolDir, card.commandId + '.json');
    try {
      // Freeze the payload before its first POST. If the response is lost, a retry sends identical bytes.
      let queued;
      try { queued = JSON.parse(await fs.readFile(spoolFile, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (queued?.revision !== card.revision) {
        const payload = {...card.body, previews:[], unverified:[...card.body.unverified]};
        for (const item of card.previews.slice(0,3)) {
          try { payload.previews.push(await mobilePreview(root, item)); }
          catch { payload.unverified.push(clean('미리보기를 전달할 수 없습니다. ' + item.caption, 400)); }
        }
        queued = {revision:card.revision, payload};
        await fs.mkdir(spoolDir, {recursive:true});
        const temp = spoolFile + '.' + crypto.randomUUID() + '.tmp';
        try {
          await fs.writeFile(temp, JSON.stringify(queued), {flag:'wx',mode:0o600});
          await fs.rename(temp, spoolFile);
        } finally { await fs.rm(temp, {force:true}); }
      }
      const {payload} = queued;
      const ack = await send(payload);
      if (!ack?.accepted || ack.commandId !== card.commandId) throw new Error('지시와 일치하는 결과 수신 확인이 필요합니다.');
      state.resultReceipts[card.commandId] = card.revision;
      saveState(); attempts.delete(card.revision);
      await fs.rm(spoolFile, {force:true});
    } catch (error) {
      const previous = attempts.get(card.revision);
      const delay = Math.min(300000, (previous?.delay ?? 3000) * 2);
      attempts.set(card.revision,{next:Date.now()+delay, delay});
      if (!previous) console.error('결과함 전달 대기: ' + safeDisplay(error.message));
    }
  };
}
