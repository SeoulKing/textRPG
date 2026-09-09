import { defineRegion } from "../types";
import { arcanaHuntingGroundChoiceDefinitions } from "./choices";
import { arcanaHuntingGroundLocation } from "./location";
import { arcanaHuntingGroundSceneDefinitions } from "./scenes";

export const arcanaHuntingGroundRegion = defineRegion({
  location: arcanaHuntingGroundLocation,
  choices: arcanaHuntingGroundChoiceDefinitions,
  scenes: arcanaHuntingGroundSceneDefinitions,
});
