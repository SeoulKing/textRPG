import type { ChoiceDefinition, EventDefinition, LocationDefinition, SceneDefinition } from "../../schemas";

export type RegionContentModule = {
  location: LocationDefinition;
  choices: ChoiceDefinition[];
  events: EventDefinition[];
  scenes: SceneDefinition[];
  sceneIdsWithoutLocationInteractions?: string[];
};
