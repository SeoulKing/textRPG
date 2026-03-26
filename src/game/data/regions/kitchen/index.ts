import type { RegionContentModule } from "../types";
import { kitchenChoiceDefinitions } from "./choices";
import { kitchenEventDefinitions } from "./events";
import { kitchenLocation } from "./location";
import { kitchenSceneDefinitions } from "./scenes";

export const kitchenRegion: RegionContentModule = {
  location: kitchenLocation,
  choices: kitchenChoiceDefinitions,
  events: kitchenEventDefinitions,
  scenes: kitchenSceneDefinitions,
};
