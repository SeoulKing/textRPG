import { defineRegion } from "../types";
import { kitchenChoiceDefinitions } from "./choices";
import { kitchenLocation } from "./location";
import { kitchenSceneDefinitions } from "./scenes";

export const kitchenRegion = defineRegion({
  location: kitchenLocation,
  choices: kitchenChoiceDefinitions,
  scenes: kitchenSceneDefinitions,
});
