import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { recordTaskCompletion } from '../scripts/studio/collaboration.mjs';
import { createResultDelivery, inboxResults } from '../scripts/studio/result-inbox.mjs';

const stamp = '2026-11-24T10:00:00.000Z';
const picture = 'art/scene.png';

function finishedBoard(sha256) {
  const commandId = randomUUID();
  const scope = {read:['art/scene.png'], write:['art/scene.png']};
  const goal = {id:'Art', title:'시장', status:'active', studioWorkflow:'autonomous-v1', scope,
    acceptance:['석교 확인'], approval:{status:'approved', approvedBy:'owner', approvedAt:stamp, allowedChecks:[],newArt:true,publish:false},
    sourceInstruction:{commandId,actorUserId:'owner',receivedAt:stamp}};
  const evidence = [{path:picture,summary:'본편 카메라'}];
  const task = {id:'Shot',goalId:goal.id,status:'done',organization:'world',title:'본편 촬영',priority:1,dependsOn:[],
    scope,playerChange:'석교',capabilities:['art'],acceptance:goal.acceptance,
    runtime:{reviewResultPath:'art/review.json',evidence:[picture],reviewEvidence:evidence}};
  const board = {project:'arcana',version:1,settings:{maxConcurrentAgents:4,defaultMinutes:20,maxReviewPasses:2},
    goals:[goal],tasks:[task],decisions:[],requests:[]};
  const report = recordTaskCompletion(board, task,{at:stamp});
  Object.assign(report,{status:'processed',processedAt:stamp,attempts:1,
    decision:{action:'ready_for_acceptance',summary:'석교를 적용했습니다.',acceptanceEvidence:[{criterion:'석교 확인',evidence,completedTaskIds:[task.id]}],
      previews:[{role:'after',caption:'적용 후',path:picture,sha256}],unverified:['실플레이']}});
  goal.supervision.status='ready_for_acceptance';
  return board;
}

test('only autonomous, finalized commands have a completion card', () => {
  const board = finishedBoard('a'.repeat(64));
  assert.equal(inboxResults(board)[0].body.status, 'completed');
  board.tasks[0].status = 'active';
  assert.deepEqual(inboxResults(board), []);
  const interrupted = inboxResults(board, {goalId:board.goals[0].id,reason:'편집기 확인 필요',updatedAt:stamp});
  assert.equal(interrupted[0].body.exception,'편집기 확인 필요');
  board.tasks[0].status = 'blocked';
  board.tasks[0].runtime.blockReason = '열린 편집기에 연결해야 합니다.';
  assert.equal(inboxResults(board)[0].body.status, 'needs_attention');
  delete board.goals[0].studioWorkflow;
  assert.deepEqual(inboxResults(board), []);
});

test('delivery uploads only the reviewed bytes and acknowledges one card across reconnects', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'arcana-inbox-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const directory = path.join(root,'docs/studio');
  await fs.mkdir(directory,{recursive:true});
  await fs.mkdir(path.join(root,'art'));
  const img = await sharp({create:{width:12,height:8,channels:3,background:'#387f7a'}}).png().toBuffer();
  await fs.writeFile(path.join(root,picture),img);
  const board = finishedBoard(createHash('sha256').update(img).digest('hex'));
  await fs.writeFile(path.join(directory,'board.json'),JSON.stringify(board));
  const received = [];
  const state = {};
  const config = {root,state,saveState(){},async send(card){received.push(card);return {accepted:true,commandId:card.commandId};}};
  await createResultDelivery(config)();
  await createResultDelivery(config)();
  assert.equal(received.length,1);
  assert.equal(received[0].previews.length,1);
  assert.equal((await sharp(Buffer.from(received[0].previews[0].data,'base64')).metadata()).format,'webp');
  assert.deepEqual(received[0].unverified,['실플레이']);
  await fs.writeFile(path.join(root,picture),'changed bytes');
  await createResultDelivery({...config,state:{}})();
  assert.equal(received[1].previews.length,0);
  assert.match(received[1].unverified.at(-1),/미리보기/);
  await fs.writeFile(path.join(root,picture),img);
  const retryState = {};
  let firstPayload;
  await createResultDelivery({...config,state:retryState,async send(card) {
    firstPayload = card;
    throw new Error('응답 연결 종료');
  }})();
  await fs.writeFile(path.join(root,picture),'changed after first post');
  await createResultDelivery({...config,state:retryState})();
  assert.deepEqual(received[2],firstPayload);
});
