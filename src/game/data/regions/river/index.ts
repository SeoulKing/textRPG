import { defineRegion } from "../types";
import { riverLocation } from "./location";
import { riverSceneDefinitions } from "./scenes";

export const riverRegion = defineRegion({
  location: riverLocation,
  scenes: riverSceneDefinitions,
});
