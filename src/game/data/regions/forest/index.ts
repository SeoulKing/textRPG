import { defineRegion } from "../types";
import { forestLocation } from "./location";
import { forestSceneDefinitions } from "./scenes";

export const forestRegion = defineRegion({
  location: forestLocation,
  scenes: forestSceneDefinitions,
});
