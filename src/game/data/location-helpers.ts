import type { ActionDefinition, LocationDefinition, StockNodeDefinition } from "../schemas";

type LocationInput = Omit<
  LocationDefinition,
  "imagePath" | "residentIds" | "interactionChoices" | "eventIds" | "stockNodes"
> &
  Partial<
    Pick<LocationDefinition, "imagePath" | "residentIds" | "interactionChoices" | "eventIds" | "stockNodes">
  >;

type StockNodeInput = Omit<StockNodeDefinition, "money" | "items"> &
  Partial<Pick<StockNodeDefinition, "money" | "items">>;

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
    ...input,
  };
}

export function stockNode(input: StockNodeInput): StockNodeDefinition {
  return {
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
