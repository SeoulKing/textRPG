import { defineRegion } from "../types";
import { arcanaDistrictLocations } from "./location";
import { arcanaDistrictScenes } from "./scenes";

export const arcanaDistrictRegions = arcanaDistrictLocations.map((location) =>
  defineRegion({ location, scenes: arcanaDistrictScenes.filter((scene) => scene.locationId === location.id) }),
);
