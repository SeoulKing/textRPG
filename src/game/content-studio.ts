import path from "node:path";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { RETIRED_ACTION_IDS } from "./content-retirements";
import {
  ChoiceDefinitionSchema,
  ConditionSchema,
  EffectSchema,
  ItemCardSchema,
  SceneDefinitionSchema,
  LocationDefinitionSchema, PersonCardSchema, ActionDefinitionSchema, EventDefinitionSchema,
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

export const StudioChoiceSchema = ChoiceDefinitionSchema.extend({
  once: z.boolean().optional(),
  nextStoryId: z.string().optional(),
  endsStory: z.boolean().optional(),
});
export const StudioPersonSchema = PersonCardSchema.omit({ source: true, generatedAt: true });
export const StudioLocationSchema = LocationDefinitionSchema.extend({
  discoveryConditions: z.array(ConditionSchema).optional(),
});
export const StudioSceneSchema = SceneDefinitionSchema.omit({
  choiceIds: true,
}).extend({
  paragraphs: z.array(z.string()).default([]),
  choices: z.array(StudioChoiceSchema).default([]),
  blocks: z.array(z.object({ speakerId: z.string().optional(), text: z.string() })).optional(),
  terminal: z.boolean().optional(),
});

export const StudioStorySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  locationId: z.string(),
  entryLabel: z.string(),
  entryHint: z.string().default("이야기를 시작한다."),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  scenes: z.array(StudioSceneSchema).default([]),
  once: z.boolean().optional(),
  status: z.enum(["draft", "ready"]).default("draft"),
  personIds: z.array(z.string()).default([]),
  prerequisite: z.object({ storyId: z.string(), choiceId: z.string().optional() }).optional(),
  native: z.enum(["event", "region"]).optional(),
  event: EventDefinitionSchema.optional(),
  actions: z.array(ActionDefinitionSchema).default([]),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});

export const ContentStudioDocumentSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
  locations: z.array(StudioLocationSchema).default([]),
  people: z.array(StudioPersonSchema).default([]),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
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
  "text",
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
  craft_wood_plank: "crafting",
  craft_firewood: "crafting",
  craft_shelter_wall_patch: "crafting",
  craft_shelter_brazier: "crafting",
  craft_shelter_rain_bucket: "crafting",
  craft_crude_axe: "crafting",
  craft_utility_knife: "crafting",
  craft_dented_pot: "crafting",
  assemble_rescue_radio: "crafting",
  cook_at_shelter: "cooking",
  cook_rice_porridge: "cooking",
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
  asUniqueRecord(document.locations, "location");
  asUniqueRecord(document.people, "person");
  asUniqueRecord(document.items, "item");
  asUniqueRecord(document.recipes, "recipe");
  asUniqueRecord(document.stories, "story");

  const sceneIds = new Set<string>();
  const choiceIds = new Map<string, string>();
  document.stories.forEach((story) => {
    story.scenes.forEach((scene) => {
      if (sceneIds.has(scene.id)) {
        throw new Error(`scene id '${scene.id}' is duplicated.`);
      }
      sceneIds.add(scene.id);
      scene.choices.forEach((choice) => {
        if (choiceIds.has(choice.id) && choiceIds.get(choice.id) !== JSON.stringify(choice)) {
          throw new Error(`choice id '${choice.id}' is duplicated.`);
        }
        choiceIds.set(choice.id, JSON.stringify(choice));
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

// Apply catalog edits to stored Studio documents, including database-backed drafts.
// Archived game versions keep their original catalog until explicitly upgraded.
function migrateFoodCatalog(document: ContentStudioDocument): ContentStudioDocument {
  const removedItems = new Set(["greensSoup", "forestStew"]);
  const removedRecipes = new Set(["cook_greens_soup", "cook_forest_stew"]);
  const itemIdLists = new Set(["obtainableItemIds", "inventoryItemIds"]);
  function visit(value: unknown, field = ""): unknown {
    if (typeof value === "string") {
      if (field === "itemId") return value === "wildGreens" ? "vegetables" : value;
      return value.replace(/\{\{item:wildGreens(?=[|}])/g, "{{item:vegetables").replace(/산나물/g, "채소");
    }
    if (Array.isArray(value)) {
      if (itemIdLists.has(field)) {
        return [...new Set(value.filter(id => !removedItems.has(id)).map(id => id === "wildGreens" ? "vegetables" : id))];
      }
      return value.filter(entry => {
        if (["choiceIds", "availableActionIds"].includes(field) && typeof entry === "string") return !RETIRED_ACTION_IDS.has(entry);
        if (!entry || typeof entry !== "object") return true;
        if (["actions", "interactionChoices", "choices"].includes(field) && RETIRED_ACTION_IDS.has(entry.id)) return false;
        if (field === "items") return entry.id !== "wildGreens" && !removedItems.has(entry.id ?? entry.itemId);
        if (field === "recipes" || field === "choices") return !removedRecipes.has(entry.id);
        return true;
      }).map(entry => visit(entry, field));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry, key)]));
    }
    return value;
  }
  return parseContentStudioDocument(visit(document));
}

function migrateWoodProcessing(document: ContentStudioDocument): ContentStudioDocument {
  const loggingIds = new Set(["chop_wood_at_forest", "chop_wood_with_crude_axe"]);
  const cookingIds = new Set(["cook_at_shelter", "cook_rice_porridge", "cook_grilled_fish"]);
  function visit(value: unknown, field = "", replacement?: "wood" | "firewood"): unknown {
    if (typeof value === "string") {
      if (!replacement) return value;
      if (field === "itemId") return value === "woodPlank" ? replacement : value;
      return value
        .replace(/\{\{item:woodPlank(?=[|}])/g, `{{item:${replacement}`)
        .replace(/목재 판자/g, replacement === "wood" ? "목재" : "땔감")
        .replace(/(\{\{item:(?:wood|firewood)\}\}) 한 (?:장|개)이/g, "$1 한 개가")
        .replace(/(\{\{item:(?:wood|firewood)\}\}) 한 장/g, "$1 한 개")
        .replace("목재로 쓸 만한 판자들을 챙겼다.", "가공할 {{item:wood|을를}} 모았다.");
    }
    if (Array.isArray(value)) return value.map(entry => visit(entry, field, replacement));
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const target = loggingIds.has(id) ? "wood"
        : cookingIds.has(id) || record.menu === "cooking" ? "firewood" : replacement;
      const migrated = Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, visit(entry, key, target)]));
      if (id === "woodPlank" && migrated.description === "부서진 선반이나 가구에서 뜯어 낸 판자다. 거처 보강과 불쏘시개에 쓸 수 있다.") {
        migrated.description = "목재를 평평하게 다듬은 판자다. 거처 보강과 시설, 도구 제작에 쓸 수 있다.";
      }
      if (field === "locations" && Array.isArray(migrated.obtainableItemIds)) {
        const added = id === "forest" ? ["wood"] : id === "shelter" ? ["wood", "firewood"] : [];
        migrated.obtainableItemIds = [...new Set([...migrated.obtainableItemIds, ...added])];
      }
      return migrated;
    }
    return value;
  }
  return parseContentStudioDocument(visit(document));
}

export function effectiveContentStudioDocument(
  stored: ContentStudioDocument,
  builtInItems: Record<string, StudioItem>,
  builtInChoices: ChoiceDefinition[],
): ContentStudioDocument {
  stored = migrateWoodProcessing(migrateFoodCatalog(stored));
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
    ...stored,
    version: 2,
    items,
    recipes,
    stories: stored.stories,
  });
}

export const StudioEffectSchema = EffectSchema;
