import { defineRegion } from "../types";
import { subwayChoiceDefinitions } from "./choices";
import { subwayLocation } from "./location";
import { subwaySceneDefinitions } from "./scenes";

export const subwayRegion = defineRegion({
  location: subwayLocation,
  choices: subwayChoiceDefinitions,
  scenes: subwaySceneDefinitions,
});
