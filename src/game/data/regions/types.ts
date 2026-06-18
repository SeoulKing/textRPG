import type { ChoiceDefinition, EventDefinition, LocationDefinition, SceneDefinition } from "../../schemas";

export type RegionContentModule = {
  location: LocationDefinition;
  choices: ChoiceDefinition[];
  events: EventDefinition[];
  scenes: SceneDefinition[];
  sceneIdsWithoutLocationInteractions?: string[];
};

export type RegionContentInput = {
  location: LocationDefinition;
  scenes: SceneDefinition[];
  choices?: ChoiceDefinition[];
  events?: EventDefinition[];
  sceneIdsWithoutLocationInteractions?: Iterable<string>;
};

export function defineRegion(input: RegionContentInput): RegionContentModule {
  return {
    location: input.location,
    choices: input.choices ?? [],
    events: input.events ?? [],
    scenes: input.scenes,
    sceneIdsWithoutLocationInteractions: input.sceneIdsWithoutLocationInteractions
      ? [...input.sceneIdsWithoutLocationInteractions]
      : undefined,
  };
}
