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
import {
  canonicalizeItemText,
  type ItemTextRegistry,
} from "./item-text";

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

const ITEM_TEXT_FIELDS = new Set([
  "label",
  "outcomeHint",
  "failureNote",
  "systemNote",
  "descriptionTag",
  "message",
  "title",
  "entryLabel",
  "entryHint",
  "paragraphs",
]);

function itemTextRegistry(
  items: Array<{ id: string; name: string }>,
): ItemTextRegistry {
  return {
    items: Object.fromEntries(
      items.map((item) => [item.id, { name: item.name }]),
    ),
  } as ItemTextRegistry;
}

function migrateItemTextValue(
  value: unknown,
  field: string,
  registry: ItemTextRegistry,
): unknown {
  if (typeof value === "string") {
    return ITEM_TEXT_FIELDS.has(field)
      ? canonicalizeItemText(value, registry)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => migrateItemTextValue(entry, field, registry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      migrateItemTextValue(entry, key, registry),
    ]),
  );
}

export function normalizeContentStudioItemTextReferences(input: unknown) {
  const document = parseContentStudioDocument(input);
  const registry = itemTextRegistry(document.items);
  return parseContentStudioDocument({
    ...document,
    recipes: migrateItemTextValue(document.recipes, "recipes", registry),
    stories: migrateItemTextValue(document.stories, "stories", registry),
  });
}

export function migrateRenamedItemTextReferences(
  input: unknown,
  previous: ContentStudioDocument,
) {
  let document = parseContentStudioDocument(input);
  const previousItems = asUniqueRecord(previous.items, "item");

  document.items.forEach((item) => {
    const previousName = previousItems[item.id]?.name;
    if (!previousName || previousName === item.name) {
      return;
    }
    const previousRegistry = itemTextRegistry([
      { id: item.id, name: previousName },
    ]);
    document = parseContentStudioDocument({
      ...document,
      recipes: migrateItemTextValue(document.recipes, "recipes", previousRegistry),
      stories: migrateItemTextValue(document.stories, "stories", previousRegistry),
    });
  });

  return normalizeContentStudioItemTextReferences(document);
}

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
  cook_grilled_fish: "cooking",
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

  return normalizeContentStudioItemTextReferences({
    version: 1,
    items,
    recipes,
    stories: stored.stories,
  });
}

export const StudioEffectSchema = EffectSchema;
