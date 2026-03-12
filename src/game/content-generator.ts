import {
  baseItems,
  baseLocations,
  basePeople,
  baseSkills,
  PHASES,
} from "./base-data";
import { sceneParagraphTemplates, eventSummaryTemplate } from "./data/story-templates";
import { summarizeState } from "./rules";
import type {
  ActionChoice,
  EventCard,
  GameState,
  ItemCard,
  LocationCard,
  PersonCard,
  ProtagonistCard,
  SceneCard,
  StoryMaterials,
} from "./schemas";
import {
  EventCardSchema,
  ItemCardSchema,
  LocationCardSchema,
  PersonCardSchema,
  ProtagonistCardSchema,
  SceneCardSchema,
} from "./schemas";

type GeneratorInput = {
  state: GameState;
  gameId: string;
  recentLog: string[];
  allowedActions: ActionChoice[];
  storyMaterials: StoryMaterials;
};

export interface ContentGenerator {
  generateLocationCard(locationId: string, input: GeneratorInput): Promise<LocationCard>;
  generatePersonCard(personId: string, input: GeneratorInput): Promise<PersonCard>;
  generateItemCard(itemId: string, input: GeneratorInput): Promise<ItemCard>;
  generateProtagonistCard(input: GeneratorInput): Promise<ProtagonistCard>;
  generateSceneCard(input: GeneratorInput): Promise<SceneCard>;
  generateEventCard(locationId: string, input: GeneratorInput): Promise<EventCard>;
}

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function storyChoiceFromAction(actionChoice: ActionChoice, overrides?: Partial<{ label: string; outcomeHint: string }>) {
  return {
    id: actionChoice.id,
    label: overrides?.label || actionChoice.label,
    outcomeHint: overrides?.outcomeHint || actionChoice.outcomeHint,
    serverActionHint: actionChoice.action,
  };
}

class TemplateContentGenerator implements ContentGenerator {
  async generateLocationCard(locationId: string, input: GeneratorInput) {
    const location = baseLocations[locationId];
    const availableActionIds = [
      ...Object.entries(location.links)
        .filter(([, link]) => !link.requiredFlag || input.state.flags[link.requiredFlag])
        .map(([targetId]) => `travel:${targetId}`),
      `event:${locationId}`,
    ];
    return LocationCardSchema.parse({
      id: location.id,
      name: location.name,
      risk: location.risk,
      summary: location.summary,
      description: `${location.summary} ${summarizeState(input.state).phase} 특유의 공기와 생존자들의 흔적이 이곳의 분위기를 바꾼다.`,
      tags: [...location.tags],
      traits: [...location.traits],
      obtainableItemIds: [...location.obtainableItemIds],
      residentIds: [...location.residentIds],
      neighbors: Object.keys(location.links),
      imagePath: location.imagePath,
      source: "template",
      generatedAt: nowIso(),
      availableActionIds,
      eventIds: [],
    });
  }

  async generatePersonCard(personId: string, _input: GeneratorInput) {
    const person = basePeople[personId as keyof typeof basePeople];
    return PersonCardSchema.parse({
      ...person,
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateItemCard(itemId: string, _input: GeneratorInput) {
    const item = baseItems[itemId as keyof typeof baseItems];
    return ItemCardSchema.parse({
      ...item,
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateProtagonistCard(input: GeneratorInput) {
    const state = summarizeState(input.state);
    return ProtagonistCardSchema.parse({
      id: "protagonist",
      name: "이름 없는 생존자",
      summary: "폐허가 된 서울에서 3일을 버티며 다음 선택을 강요받는 생존자다.",
      inventoryItemIds: Object.keys(input.state.inventory),
      usableSkillIds: [...input.state.skills],
      condition: {
        hp: state.hp,
        mind: state.mind,
        fullness: state.fullness,
        money: state.money,
        locationId: input.state.location,
        day: input.state.day,
        phaseIndex: input.state.phaseIndex,
      },
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateSceneCard(input: GeneratorInput) {
    const state = summarizeState(input.state);
    const location = baseLocations[input.state.location];
    const ctx = {
      locationSummary: location.summary,
      localPeople: input.storyMaterials.people.map((person) => person.name).join(", "),
      localItems: input.storyMaterials.items.map((item) => item.name).join(", "),
      recentLog: input.recentLog.join(" / "),
      phase: state.phase,
    };
    const supportChoices = input.allowedActions.filter((entry) => entry.action.type !== "travel").slice(0, 4);
    const paragraphs = sceneParagraphTemplates.map((tpl) => tpl(ctx));
    return SceneCardSchema.parse({
      id: `scene:${input.state.location}:${input.state.day}:${input.state.phaseIndex}`,
      locationId: input.state.location,
      title: `${location.name}, ${input.state.day}일차 ${PHASES[input.state.phaseIndex]}`,
      paragraphs,
      choices: supportChoices.map((choice) => storyChoiceFromAction(choice)),
      materialIds: {
        locationIds: input.storyMaterials.locations.map((entry) => entry.id),
        personIds: input.storyMaterials.people.map((entry) => entry.id),
        itemIds: input.storyMaterials.items.map((entry) => entry.id),
      },
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateEventCard(locationId: string, input: GeneratorInput) {
    const location = baseLocations[locationId];
    const eventChoices = input.allowedActions
      .filter((entry) => entry.action.type === "generate_event")
      .slice(0, 2);
    return EventCardSchema.parse({
      id: `event:${locationId}:${input.state.day}:${input.state.phaseIndex}`,
      locationId,
      title: `${location.name}의 즉흥 사건`,
      summary: eventSummaryTemplate(location.name),
      trigger: `${input.state.day}일차 ${PHASES[input.state.phaseIndex]}`,
      choices: eventChoices.length > 0
        ? eventChoices.map((choice) => storyChoiceFromAction(choice))
        : [{
            id: "event:observe",
            label: "흔적을 관찰한다",
            outcomeHint: "새 단서나 소문을 얻을 수 있다.",
            serverActionHint: {
              type: "generate_event",
              locationId,
            },
          }],
      rewards: ["소문", "새 카드 해금 가능"],
      flags: ["generated_event"],
      source: "template",
      generatedAt: nowIso(),
    });
  }
}

class RemoteContentGenerator implements ContentGenerator {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallback: TemplateContentGenerator,
  ) {}

  private async generateJson<T>(
    schemaName: string,
    schemaPrompt: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.apiUrl.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `You generate JSON only. Output must satisfy this schema: ${schemaPrompt}. Never invent arbitrary game rules. Use only serverActionHint values that can be justified by the provided allowedActions.`,
          },
          {
            role: "user",
            content: JSON.stringify({ schemaName, payload }),
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM did not return content.");
    }

    return JSON.parse(stripCodeFence(content)) as T;
  }

  async generateLocationCard(locationId: string, input: GeneratorInput) {
    const fallback = await this.fallback.generateLocationCard(locationId, input);
    return LocationCardSchema.parse(await this.generateJson("locationCard", "location card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      allowedActions: input.allowedActions,
    }));
  }

  async generatePersonCard(personId: string, input: GeneratorInput) {
    const fallback = await this.fallback.generatePersonCard(personId, input);
    return PersonCardSchema.parse(await this.generateJson("personCard", "person card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      allowedActions: input.allowedActions,
    }));
  }

  async generateItemCard(itemId: string, input: GeneratorInput) {
    const fallback = await this.fallback.generateItemCard(itemId, input);
    return ItemCardSchema.parse(await this.generateJson("itemCard", "item card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      allowedActions: input.allowedActions,
    }));
  }

  async generateProtagonistCard(input: GeneratorInput) {
    const fallback = await this.fallback.generateProtagonistCard(input);
    return ProtagonistCardSchema.parse(await this.generateJson("protagonistCard", "protagonist card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      allowedActions: input.allowedActions,
    }));
  }

  async generateSceneCard(input: GeneratorInput) {
    const fallback = await this.fallback.generateSceneCard(input);
    return SceneCardSchema.parse(await this.generateJson("sceneCard", "scene card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      questState: input.state.quests,
      visiblePeople: input.storyMaterials.people,
      visibleItems: input.storyMaterials.items,
      protagonist: input.storyMaterials.protagonist,
      allowedActions: input.allowedActions,
    }));
  }

  async generateEventCard(locationId: string, input: GeneratorInput) {
    const fallback = await this.fallback.generateEventCard(locationId, input);
    return EventCardSchema.parse(await this.generateJson("eventCard", "event card json", {
      fallback,
      currentState: summarizeState(input.state),
      recentLog: input.recentLog,
      storyMaterials: input.storyMaterials,
      questState: input.state.quests,
      locationId,
      allowedActions: input.allowedActions,
    }));
  }
}

export function createContentGenerator() {
  const fallback = new TemplateContentGenerator();
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiUrl || !apiKey) {
    return fallback;
  }

  return new RemoteContentGenerator(apiUrl, apiKey, model, fallback);
}
