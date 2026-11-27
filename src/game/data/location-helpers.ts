import type { ActionDefinition, LocationDefinition, StockNodeDefinition } from "../schemas";

type LocationInput = Omit<
  LocationDefinition,
  "imagePath" | "residentIds" | "interactionChoices" | "eventIds" | "stockNodes" | "monsters"
> &
  Partial<
    Pick<LocationDefinition, "imagePath" | "residentIds" | "interactionChoices" | "eventIds" | "stockNodes" | "monsters">
  >;

type StockNodeInput = Omit<StockNodeDefinition, "depletionBehavior" | "money" | "items"> &
  Partial<Pick<StockNodeDefinition, "depletionBehavior" | "money" | "items">>;

type InteractionInput = Omit<
  ActionDefinition,
  "visibility" | "presentationMode" | "conditions" | "failureEffects" | "locationIds"
> &
  Partial<Pick<ActionDefinition, "presentationMode" | "conditions" | "failureEffects" | "locationIds">>;

export function defineLocation(input: LocationInput): LocationDefinition {
  return {
    imagePath: null,
    residentIds: [],
    interactionChoices: [],
    eventIds: [],
    stockNodes: [],
    monsters: [],
    ...input,
  };
}

export function stockNode(input: StockNodeInput): StockNodeDefinition {
  return {
    depletionBehavior: "remain",
    money: 0,
    items: [],
    ...input,
  };
}

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
