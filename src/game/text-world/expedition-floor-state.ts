import type { GameState } from "../schemas";
import { canReach, pathOpen, visibleEntities } from "./world";
/** An unresolved or escaped encounter never grants free access to its caches. */
export function expeditionFloorReady(state: GameState) {
  const e = state.subwayExpedition, p = e.currentFloorProgress;
  return state.location === "subway" && e.active && Boolean(e.currentFloor) && !state.isGameOver && !state.stageClear
    && p.eventResolved && ["complete", "loot"].includes(p.phase)
    && (!p.encounter || ["victory", "talked_down", "resolved"].includes(p.encounter.resolution ?? ""));
}
export function expeditionFloorIds(state: GameState, depth = state.subwayExpedition.depth) {
  const prefix = "depth_" + state.subwayExpedition.runNumber + "_" + depth;
  return { room: prefix + "_room", landing: prefix + "_landing", door: prefix + "_door", prefix };
}
export function expeditionRouteOptions(state: GameState) {
  const world = state.textWorld, e = state.subwayExpedition;
  if (!world?.active || !expeditionFloorReady(state)) return [];
  return visibleEntities(world).flatMap(entity => {
    const route = entity.components.expeditionRoute;
    if (!route || route.floorId !== e.currentFloor!.id || !canReach(world,entity) || world.player.near !== entity.id) return [];
    const commands: ("ascend" | "descend" | "return")[] = route.command === "ascend" ? ["ascend","return"] : [route.command];
    return commands.flatMap(command=>{
      if(command==="ascend" && !e.exploredFloors[String(e.depth-1)])return [];
      if(command==="return")for(let depth=1;depth<e.depth;depth++){
        const previous=expeditionFloorIds(state,depth);
        if(world.rooms?.[previous.room] && !pathOpen(world,previous.landing,previous.room))return [];
      }
      const minutes = command === "return" ? e.depth * 5 : 15;
      return [{ id: "journey:" + command, nodeId: entity.id, subwayCommand: command,
        label: command === "descend" ? "다음 지하층으로 내려간다" : command === "ascend" ? "이전 지하층으로 올라간다" : "탐험을 마치고 대합실로 돌아간다",
        hint: "+" + minutes + "분", importance: "major" as const, loading: {durationMs:500,transitionType:"activity" as const} }];
    });
  });
}
