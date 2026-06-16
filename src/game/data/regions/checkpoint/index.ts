import type { RegionContentModule } from "../types";
import { checkpointChoiceDefinitions } from "./choices";
import { checkpointEventDefinitions } from "./events";
import { checkpointLocation } from "./location";
import { checkpointSceneDefinitions } from "./scenes";

export const checkpointRegion: RegionContentModule = {
  location: checkpointLocation,
  choices: checkpointChoiceDefinitions,
  events: checkpointEventDefinitions,
  scenes: checkpointSceneDefinitions,
};
