import { defineRegion } from "../types";
import { convenienceChoiceDefinitions } from "./choices";
import { convenienceLocation } from "./location";
import { convenienceSceneDefinitions } from "./scenes";

export const convenienceRegion = defineRegion({
  location: convenienceLocation,
  choices: convenienceChoiceDefinitions,
  scenes: convenienceSceneDefinitions,
});
