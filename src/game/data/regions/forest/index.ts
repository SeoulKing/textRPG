import type { RegionContentModule } from "../types";
import { forestChoiceDefinitions } from "./choices";
import { forestEventDefinitions } from "./events";
import { forestLocation } from "./location";
import { forestSceneDefinitions } from "./scenes";

export const forestRegion: RegionContentModule = {
  location: forestLocation,
  choices: forestChoiceDefinitions,
  events: forestEventDefinitions,
  scenes: forestSceneDefinitions,
};
