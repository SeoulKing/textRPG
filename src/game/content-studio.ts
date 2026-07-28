import path from "node:path";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  ChoiceDefinitionSchema,
  ConditionSchema,
  EffectSchema,
  ItemCardSchema,
  SceneDefinitionSchema,
  type ChoiceDefinition,
} from "./schemas";

export const CONTENT_STUDIO_PATH = path.resolve(process.cwd(), "content", "content-studio.json");

export const StudioItemSchema = ItemCardSchema.omit({
  source: true,
  generatedAt: true,
});

export const StudioRecipeSchema = ChoiceDefinitionSchema.extend({
  menu: z.enum(["crafting", "cooking"]),
  enabled: z.boolean().default(true),
});

export const StudioSceneSchema = SceneDefinitionSchema.omit({
  choiceIds: true,
}).extend({
  choices: z.array(ChoiceDefinitionSchema).default([]),
});

export const StudioStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  locationId: z.string().min(1),
  entryLabel: z.string().min(1),
  entryHint: z.string().default("이야기를 시작한다."),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  scenes: z.array(StudioSceneSchema).min(1),
});

export const ContentStudioDocumentSchema = z.object({
  version: z.literal(1),
  items: z.array(StudioItemSchema).default([]),
  recipes: z.array(StudioRecipeSchema).default([]),
  stories: z.array(StudioStorySchema).default([]),
});

export type StudioItem = z.infer<typeof StudioItemSchema>;
export type StudioRecipe = z.infer<typeof StudioRecipeSchema>;
export type StudioScene = z.infer<typeof StudioSceneSchema>;
export type StudioStory = z.infer<typeof StudioStorySchema>;
export type ContentStudioDocument = z.infer<typeof ContentStudioDocumentSchema>;

export const BUILT_IN_RECIPE_MENUS = {
  craft_shelter_wall_patch: "crafting",
  craft_shelter_brazier: "crafting",
  craft_shelter_rain_bucket: "crafting",
  craft_crude_axe: "crafting",
  craft_utility_knife: "crafting",
  craft_dented_pot: "crafting",
  assemble_rescue_radio: "crafting",
  cook_at_shelter: "cooking",
  cook_rice_porridge: "cooking",
  cook_greens_soup: "cooking",
  cook_forest_stew: "cooking",
} as const satisfies Record<string, StudioRecipe["menu"]>;

export const CRAFTING_MENU_SCENE_IDS = [
  "shelter_crafting_menu",
  "shelter_crafting_menu_repeat",
] as const;

export const COOKING_MENU_SCENE_IDS = [
  "shelter_cooking_menu",
  "shelter_cooking_menu_repeat",
] as const;

function asUniqueRecord<T extends { id: string }>(entries: T[], label: string) {
  const record: Record<string, T> = {};
  entries.forEach((entry) => {
    if (record[entry.id]) {
      throw new Error(`${label} id '${entry.id}' is duplicated.`);
    }
    record[entry.id] = entry;
  });
  return record;
}

export function assertUniqueStudioIds(document: ContentStudioDocument) {
  asUniqueRecord(document.items, "item");
  asUniqueRecord(document.recipes, "recipe");
  asUniqueRecord(document.stories, "story");

  const sceneIds = new Set<string>();
  const choiceIds = new Set<string>();
  document.stories.forEach((story) => {
    story.scenes.forEach((scene) => {
      if (sceneIds.has(scene.id)) {
        throw new Error(`scene id '${scene.id}' is duplicated.`);
      }
      sceneIds.add(scene.id);
      scene.choices.forEach((choice) => {
        if (choiceIds.has(choice.id)) {
          throw new Error(`choice id '${choice.id}' is duplicated.`);
        }
        choiceIds.add(choice.id);
      });
    });
  });
  return document;
}

export function parseContentStudioDocument(input: unknown) {
  return assertUniqueStudioIds(ContentStudioDocumentSchema.parse(input));
}

export function loadStoredContentStudioDocument(): ContentStudioDocument {
  try {
    const raw = readFileSync(CONTENT_STUDIO_PATH, "utf8");
    return parseContentStudioDocument(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return ContentStudioDocumentSchema.parse({ version: 1 });
    }
    throw error;
  }
}

export function effectiveContentStudioDocument(
  stored: ContentStudioDocument,
  builtInItems: Record<string, StudioItem>,
  builtInChoices: ChoiceDefinition[],
): ContentStudioDocument {
  const storedItems = asUniqueRecord(stored.items, "item");
  const items = Object.values({
    ...builtInItems,
    ...storedItems,
  });

  const storedRecipes = asUniqueRecord(stored.recipes, "recipe");
  const builtInRecipes = builtInChoices.flatMap((choice) => {
    const menu = BUILT_IN_RECIPE_MENUS[choice.id as keyof typeof BUILT_IN_RECIPE_MENUS];
    return menu
      ? [StudioRecipeSchema.parse({
        ...choice,
        menu,
        enabled: true,
      })]
      : [];
  });
  const recipes = Object.values({
    ...asUniqueRecord(builtInRecipes, "recipe"),
    ...storedRecipes,
  });

  return parseContentStudioDocument({
    version: 1,
    items,
    recipes,
    stories: stored.stories,
  });
}

export const StudioEffectSchema = EffectSchema;
