import { defineRegion } from "../types";
import { arcanaPlazaChoiceDefinitions } from "./choices";
import { arcanaPlazaLocation } from "./location";
import { arcanaPlazaSceneDefinitions } from "./scenes";

export const arcanaPlazaRegion = defineRegion({
  location: arcanaPlazaLocation,
  choices: arcanaPlazaChoiceDefinitions,
  scenes: arcanaPlazaSceneDefinitions,
});
