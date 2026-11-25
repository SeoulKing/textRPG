import type { GameSession } from "../game/schemas";
import type { ActionReceipt } from "./action-receipts";
import type { ArcanaSpatial } from "../game/schemas/arcana-spatial";
import type { Character } from "./accounts";
import type { SpatialEnemy, CombatPoint } from "../game/schemas/arcana-spatial";
import { MEADOW_LOCATION } from "../game/arcana-meadow";
export type Point = CombatPoint;
export type Place = {location:string;interior:string;floor:number};
export type Actor = {character:Character; game:GameSession; place:Place; position:Point; previous:Point; direction:Point; walking:boolean; bench:string; gait:number; lastMoveAt:number; disconnectedAt:number|null; sessionId:string; controller:string; accepted:number; version:number; lastSeen:number;sessionExpires:number;moveCredit?:number;pending?:boolean;placeRevision?:number;actionReceipts?:ActionReceipt[];slimeContactReadyAtMs?:number};
export type SharedEnemy = SpatialEnemy & {lifeId:string;respawnAt:number;recoveryElapsed:number;hopCooldown:number;hasFled:boolean;contribution:Record<string,number>;targetId:string|null};
export type CombatArea = "plaza" | "meadow";
export type WorldEvent = ArcanaSpatial["events"][number] & {actorId?:string;clientActionId?:string;targetPlayerId?:string;movement?:"dodge"|"teleport";sourcePosition?:Point;area?:CombatArea};
export type Shot = ArcanaSpatial["projectiles"][number] & {ownerId:string;clientActionId?:string};
export type Meteor = ArcanaSpatial["meteors"][number] & {ownerId:string;clientActionId?:string};
export type Barrage = {clientActionId?:string;ownerId:string;remaining:number;nextIn:number;damage:number};
export type CombatArena = {enemy:SharedEnemy;projectiles:Shot[];meteors:Meteor[];barrages:Barrage[]};
export type SharedWorld = CombatArena & {campfires?:Record<string,import("./life").Campfire>;id:string;revision:number;elapsedMs:number;updatedAt:number;meadowCombat?:CombatArena;events:WorldEvent[]};
export function combatArea(actor: Actor): CombatArea | undefined {
  if (!actor.game.state.flags.in_magic_world || actor.place.interior !== "") return undefined;
  if (actor.place.location === MEADOW_LOCATION) return "meadow";
  return ["arcana_plaza", "arcana_city_gate", "arcana_hunting_ground", "arcana_return_portal"].includes(actor.place.location) ? "plaza" : undefined;
}
export const inField = (actor: Actor) => combatArea(actor) !== undefined;
export const placeArea = (place: Place) => place.interior || place.location === MEADOW_LOCATION ? place.location : "outside";
export const samePlace = (a:Place,b:Place) => a.interior===b.interior && a.floor===b.floor && placeArea(a)===placeArea(b);
