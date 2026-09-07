import type { GameState, SubwayEncounterChoice, SubwayEncounterTurnResult } from "../schemas";
import type { WorldAction } from "../schemas/text-world";
import { combatGeometry, combatOpponent, openWorldPath } from "./combat-space";
import { visibleEntities } from "./world";
import { expeditionFloorIds } from "./expedition-floor-state";
import { combatMechanicalHint } from "../subway-encounter";
import { toolProfile } from "./tool-rules";
import { combatTool } from "../tool-combat";
import { particle } from "./world";

export function spatialCombatActive(state: GameState) {
  const e=state.subwayExpedition;
  return e.active && e.spatialMode && e.currentFloorProgress.phase==="encounter" && e.currentFloorProgress.encounter?.kind==="combat" && !state.isGameOver && !state.stageClear;
}
export function spatialCombatUpgrade(state: GameState) {
  return state.subwayExpedition.active && state.subwayExpedition.spatialMode && state.subwayExpedition.currentFloorProgress.phase==="upgrade";
}
export function synchronizeCombatPresence(state: GameState) {
  const w=state.textWorld,e=state.subwayExpedition,encounter=e.currentFloorProgress.encounter,enemy=encounter?.enemy;
  if(!w||!encounter||!enemy)return;
  const ids=expeditionFloorIds(state),id=ids.prefix+"_opponent",hostile=encounter.stage!=="resolved"&&enemy.hp>0;
  let entity=w.entities[id];
  if(!entity){entity={id,name:enemy.name,description:enemy.description,details:{anchor:ids.door,placement:"맞은편 철문 앞",outline:enemy.name,surface:enemy.description},components:{position:{zone:ids.room}}};w.entities[id]=entity;}
  entity.components.combatant={awareness:entity.components.combatant?.awareness ?? {lastKnownPlayerZone:entity.components.position.zone},encounterId:encounter.id,hostile,hp:enemy.hp,maxHp:enemy.maxHp};
  if(!hostile){entity.description=enemy.name+(enemy.hp===0?"가 쓰러져 더는 공격하지 못한다.":"는 싸움을 멈췄다.");if(entity.details)entity.details.surface=entity.description;}
}
export type CombatWorldOption = {id:string;label:string;hint:string;nodeId:string;actions:WorldAction[];combatChoice:SubwayEncounterChoice;importance:"major";loading:{durationMs:number;transitionType:"activity"}};
export function combatWorldOptions(state: GameState): CombatWorldOption[] {
  const w=state.textWorld,encounter=state.subwayExpedition.currentFloorProgress.encounter,enemy=combatOpponent(state);
  if(!w?.active||!spatialCombatActive(state)||!encounter||!enemy)return [];
  const visible=visibleEntities(w).some(e=>e.id===enemy.id),choices=structuredClone(encounter.currentScene?.choices??[]),ids=expeditionFloorIds(state);
  const held=w.entities[w.player.heldItemId??""],heldItemId=held?.components.portable?.itemId;
  const tool=heldItemId && toolProfile(state,heldItemId) ? combatTool(state,heldItemId) : undefined;
  if(tool)choices.push({id:"tool-"+tool.id,label:particle(tool.name,"으로","로")+(tool.combat.kind==="guard"?" 몸을 가린다":" 공격한다"),effectDescription:"",postChoiceNarrative:[],intent:{primary:"use_item",style:"forceful",target:tool.combat.kind==="guard"?"self":"enemy",itemId:tool.id},legacyActionToken:("use_item:"+tool.id) as SubwayEncounterChoice["legacyActionToken"]});
  return choices.flatMap(choice=>{
    const token=choice.legacyActionToken,primary=choice.intent.primary;
    if(token==="throw_improvised" || !["attack","persuade","retreat","evade","defend","use_item"].includes(primary) || primary==="use_item" && choice.intent.itemId!==tool?.id)return []; // A throw needs a real projectile; narration cannot supply free stones.
    const attacking=primary==="attack" || primary==="use_item"&&tool?.combat.kind==="attack";
    if((attacking||primary==="persuade")&&!visible)return [];
    if(primary==="retreat"&&!openWorldPath(w,w.player.zone,ids.room))return [];
    const actions:WorldAction[]=attacking?[...(w.player.posture!=="standing"?[{type:"POSTURE" as const,posture:"standing" as const}]:[]),...(w.player.near!==enemy.id?[{type:"MOVE" as const,target:enemy.id}]:[])]:[];
    const projected=structuredClone(state);if(attacking)projected.textWorld!.player.posture="standing";
    const hint=token?combatMechanicalHint(projected,encounter,token):null;
    return [{id:"combat:"+choice.id,label:choice.label,hint:hint??choice.effectDescription,nodeId:enemy.id,actions,combatChoice:choice,importance:"major" as const,loading:{durationMs:500,transitionType:"activity" as const}}];
  });
}
export function combatResultEvent(state: GameState,result: SubwayEncounterTurnResult,actionText?:string) {
  const space=combatGeometry(state),encounter=state.subwayExpedition.currentFloorProgress.encounter!;
  return {type:"COMBAT" as const,witnessed:Boolean(actionText || result.resolution || result.damageDealt || result.damageTaken || result.rolls.counter!==null),targetId:expeditionFloorIds(state).prefix+"_opponent",before:{},after:{name:encounter.enemy?.name??"상대",actionText,success:result.success,resolution:result.resolution,damageDealt:result.damageDealt,damageTaken:result.damageTaken,counterAttempted:result.rolls.counter!==null,enemyHp:result.enemyHpAfter,playerHp:result.playerHpAfter,coverName:space.coverName}};
}
