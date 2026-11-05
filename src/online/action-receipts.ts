import crypto from "node:crypto";
import type { GameAction } from "../game/schemas";
import type { Actor } from "./model";
import { OnlineError } from "./accounts";

export type ActionReceipt = {id:string;fingerprint:string;at:number};
export type ActionOperation = {id:string;fingerprint:string};
const RETENTION_MS = 24*60*60*1000;
const MAX_RECEIPTS = 1024;
export function protectedTrade(action:GameAction) {
  return action.type==="arcana_combat" && ["buy_item","sell_item","buy_potion"].includes(action.command);
}
export function operation(id:unknown,payload:unknown):ActionOperation {
  if(typeof id!=="string" || !/^[a-zA-Z0-9-]{16,100}$/.test(id))throw new OnlineError("action_id_required","거래 요청 정보를 새로 확인해 주세요.",400);
  const canonical=(value:unknown):string=>Array.isArray(value)?"["+value.map(canonical).join(",")+"]":value && typeof value==="object"?"{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}":JSON.stringify(value);
  return {id,fingerprint:crypto.createHash("sha256").update(canonical(payload)).digest("hex")};
}
export function knownOperation(actor:Actor,op:ActionOperation) {
  const receipt=actor.actionReceipts?.find(v=>v.id===op.id);
  if(receipt && receipt.fingerprint!==op.fingerprint)throw new OnlineError("action_id_conflict","다른 행동에 사용된 요청 번호입니다.",409);
  return !!receipt;
}
export function reserveOperation(actor:Actor,op:ActionOperation) {
  actor.actionReceipts=(actor.actionReceipts || []).filter(v=>Date.now()-v.at<RETENTION_MS);
  if(knownOperation(actor,op))return;
  // Never evict a receipt that can still be retried: reject new work if full.
  if(actor.actionReceipts.length>=MAX_RECEIPTS)throw new OnlineError("action_receipts_full","거래 요청이 많습니다. 잠시 후 이용해 주세요.",429);
}
export function completeOperation(actor:Actor,op:ActionOperation) {
  actor.actionReceipts ??= [];
  if(!knownOperation(actor,op))actor.actionReceipts.push({...op,at:Date.now()});
}
