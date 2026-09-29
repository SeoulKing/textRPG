import { GAME_MINUTE_MS } from "./base-data";
import type { ActionDefinition, ContentRegistry, GameState, ResourceSiteDefinition } from "./schemas";

type ResourceState = GameState["resourceState"][string][string];
export type ResourceAvailability = {
  site: ResourceSiteDefinition;
  locationId: string;
  projected: ResourceState;
  remainingUses?: number;
  exhaustedHint: string;
  recoveryMinutes?: number;
};

function gameMinutes(state: GameState) {
  return ((state.worldElapsedMs ?? 0) + (state.clockRemainderMs ?? 0)) / GAME_MINUTE_MS;
}

/** Pure projection: an absent place can recover, but rendering and polling never write state. */
export function projectResourceSite(state: GameState, locationId: string, site: ResourceSiteDefinition): ResourceState {
  const now = gameMinutes(state), saved = state.resourceState?.[locationId]?.[site.id];
  if (site.unlimited || !saved) return { remaining: site.capacity, recoveryProgressMinutes: 0, updatedAtMinutes: now };
  const remaining = Math.min(site.capacity, saved.remaining);
  if (!site.recoveryMinutes || remaining === site.capacity) return { remaining, recoveryProgressMinutes: 0, updatedAtMinutes: now };
  const progress = saved.recoveryProgressMinutes + Math.max(0, now - saved.updatedAtMinutes);
  const recovered = Math.floor((progress + 1e-8) / site.recoveryMinutes);
  const nextRemaining = Math.min(site.capacity, remaining + recovered);
  return {
    remaining: nextRemaining,
    recoveryProgressMinutes: nextRemaining === site.capacity ? 0 : Math.max(0, progress - recovered * site.recoveryMinutes),
    updatedAtMinutes: now,
  };
}

export function resourceAvailability(state: GameState, action: ActionDefinition, registry: ContentRegistry): ResourceAvailability | undefined {
  if (!action.resourceUse) return undefined;
  const site = registry.locations[state.location]?.resourceSites?.find(s => s.id === action.resourceUse!.siteId);
  if (!action.locationIds.includes(state.location) || !site || !site.unlimited && action.resourceUse.cost > site.capacity) throw new Error("현재 장소에서 이용할 수 없는 채집지입니다.");
  const projected = projectResourceSite(state, state.location, site);
  if (site.unlimited) return { site, locationId: state.location, projected, exhaustedHint: "" };
  const remainingUses = Math.floor(projected.remaining / action.resourceUse.cost);
  const missing = Math.max(0, action.resourceUse.cost - projected.remaining);
  const recoveryMinutes = missing && site.recoveryMinutes
    ? Math.max(1, Math.ceil(missing * site.recoveryMinutes - projected.recoveryProgressMinutes - 1e-8)) : undefined;
  const exhaustedHint = recoveryMinutes
    ? `${site.name}에서 다시 시도하려면 게임 시간으로 ${recoveryMinutes}분이 더 필요하다.`
    : `${site.name}에서 채집할 만한 곳은 모두 확인했다. 다른 자원을 찾아야 한다.`;
  return { site, locationId: state.location, projected, remainingUses, exhaustedHint, recoveryMinutes };
}

/** Reserve a work opportunity before its effects. Failed searches still examine that part of the site. */
export function consumeResourceUse(state: GameState, action: ActionDefinition, availability: ResourceAvailability) {
  if (!action.resourceUse || availability.remainingUses === 0) throw new Error(availability.exhaustedHint);
  if (availability.site.unlimited) return;
  state.resourceState ??= {};
  state.resourceState[availability.locationId] ??= {};
  state.resourceState[availability.locationId][availability.site.id] = {
    ...availability.projected,
    remaining: availability.projected.remaining - action.resourceUse.cost,
  };
}
