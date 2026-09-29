import { defineRegion } from "../types";
import { magicCityEntranceLocation } from "./location";
import { magicCityEntranceSceneDefinitions } from "./scenes";

export const magicCityEntranceRegion = defineRegion({
  location: magicCityEntranceLocation,
  scenes: magicCityEntranceSceneDefinitions,
});
