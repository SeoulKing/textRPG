import type { RegionContentModule } from "../types";
import { hospitalChoiceDefinitions } from "./choices";
import { hospitalEventDefinitions } from "./events";
import { hospitalLocation } from "./location";
import { hospitalSceneDefinitions } from "./scenes";

export const hospitalRegion: RegionContentModule = {
  location: hospitalLocation,
  choices: hospitalChoiceDefinitions,
  events: hospitalEventDefinitions,
  scenes: hospitalSceneDefinitions,
};
