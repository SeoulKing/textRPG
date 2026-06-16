import type { RegionContentModule } from "../types";
import { subwayChoiceDefinitions } from "./choices";
import { subwayEventDefinitions } from "./events";
import { subwayLocation } from "./location";
import { subwaySceneDefinitions } from "./scenes";

export const subwayRegion: RegionContentModule = {
  location: subwayLocation,
  choices: subwayChoiceDefinitions,
  events: subwayEventDefinitions,
  scenes: subwaySceneDefinitions,
};
