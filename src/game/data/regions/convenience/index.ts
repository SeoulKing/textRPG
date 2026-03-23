import type { RegionContentModule } from "../types";
import { convenienceChoiceDefinitions } from "./choices";
import { convenienceEventDefinitions } from "./events";
import { convenienceLocation } from "./location";
import { convenienceSceneDefinitions } from "./scenes";

export const convenienceRegion: RegionContentModule = {
  location: convenienceLocation,
  choices: convenienceChoiceDefinitions,
  events: convenienceEventDefinitions,
  scenes: convenienceSceneDefinitions,
};
