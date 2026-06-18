import { defineRegion } from "../types";
import { shelterChoiceDefinitions } from "./choices";
import { shelterEventDefinitions } from "./events";
import { shelterLocation } from "./location";
import { shelterSceneDefinitions, shelterSceneIdsWithoutLocationInteractions } from "./scenes";

export const shelterRegion = defineRegion({
  location: shelterLocation,
  choices: shelterChoiceDefinitions,
  events: shelterEventDefinitions,
  scenes: shelterSceneDefinitions,
  sceneIdsWithoutLocationInteractions: shelterSceneIdsWithoutLocationInteractions,
});
