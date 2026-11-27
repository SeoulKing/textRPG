import { defineRegion } from "../types";
import { arcanaAcademyLocation } from "./location";
import { academyChoices } from "./choices";
import { academyScenes } from "./scenes";

export const arcanaAcademyRegion = defineRegion({ location: arcanaAcademyLocation, scenes: academyScenes, choices: academyChoices });
