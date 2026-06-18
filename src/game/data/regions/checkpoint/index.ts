import { defineRegion } from "../types";
import { checkpointChoiceDefinitions } from "./choices";
import { checkpointLocation } from "./location";
import { checkpointSceneDefinitions } from "./scenes";

export const checkpointRegion = defineRegion({
  location: checkpointLocation,
  choices: checkpointChoiceDefinitions,
  scenes: checkpointSceneDefinitions,
});
