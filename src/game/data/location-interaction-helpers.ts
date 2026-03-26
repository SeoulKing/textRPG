import type { ActionDefinition } from "../schemas";

type InteractionInput = Omit<ActionDefinition, "visibility" | "presentationMode" | "conditions" | "failureEffects" | "locationIds"> &
  Partial<Pick<ActionDefinition, "presentationMode" | "conditions" | "failureEffects" | "locationIds">>;

/** 장소에 붙는 상호작용 선택지. `locationIds`는 해당 장소로 고정된다. */
export function interactionFor(locationId: string, def: InteractionInput): ActionDefinition {
  return {
    visibility: "scene",
    presentationMode: "when_conditions_met",
    conditions: [],
    failureEffects: [],
    locationIds: [locationId],
    ...def,
  };
}
