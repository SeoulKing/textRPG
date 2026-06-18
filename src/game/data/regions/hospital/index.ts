import { defineRegion } from "../types";
import { hospitalChoiceDefinitions } from "./choices";
import { hospitalLocation } from "./location";
import { hospitalSceneDefinitions } from "./scenes";

export const hospitalRegion = defineRegion({
  location: hospitalLocation,
  choices: hospitalChoiceDefinitions,
  scenes: hospitalSceneDefinitions,
});
