import type { RegionContentModule } from "../types";
import { shelterChoiceDefinitions } from "./choices";
import { shelterEventDefinitions } from "./events";
import { shelterLocation } from "./location";
import { shelterSceneDefinitions, shelterSceneIdsWithoutLocationInteractions } from "./scenes";

export const shelterRegion: RegionContentModule = {
  location: shelterLocation,
  choices: shelterChoiceDefinitions,
  events: shelterEventDefinitions,
  scenes: shelterSceneDefinitions,
  sceneIdsWithoutLocationInteractions: [...shelterSceneIdsWithoutLocationInteractions],
};
