import type { LocationDefinition } from "../../schemas";
import { arcanaHuntingGroundRegion } from "./arcana-hunting-ground";
import { arcanaPlazaRegion } from "./arcana-plaza";
import { checkpointRegion } from "./checkpoint";
import { convenienceRegion } from "./convenience";
import { forestRegion } from "./forest";
import { hospitalRegion } from "./hospital";
import { kitchenRegion } from "./kitchen";
import { magicCityEntranceRegion } from "./magic-city-entrance";
import { shelterRegion } from "./shelter";
import { subwayRegion } from "./subway";

export const regionModules = [
  shelterRegion,
  convenienceRegion,
  kitchenRegion,
  forestRegion,
  hospitalRegion,
  subwayRegion,
  checkpointRegion,
  magicCityEntranceRegion,
  arcanaPlazaRegion,
  arcanaHuntingGroundRegion,
];

export const baseLocations = Object.fromEntries(
  regionModules.map((region) => [region.location.id, region.location]),
) as Record<string, LocationDefinition>;

export const actionDefinitions = regionModules.flatMap((region) => region.location.interactionChoices);
export const choiceDefinitions = regionModules.flatMap((region) => region.choices);
export const eventDefinitions = regionModules.flatMap((region) => region.events);
export const sceneDefinitions = regionModules.flatMap((region) => region.scenes);

export const SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS: ReadonlySet<string> = new Set(
  regionModules.flatMap((region) => region.sceneIdsWithoutLocationInteractions ?? []),
);

export type BaseLocation = LocationDefinition;
