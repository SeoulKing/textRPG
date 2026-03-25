import { PHASES } from "./base-data";
import { generateGeminiJson, geminiModel, hasGeminiConfig } from "./gemini-client";
import { summarizeState } from "./rules";
import { buildRuntimeRegistry } from "./runtime-registry";
import type {
  ActionChoice,
  EventCard,
  EventDefinition,
  GameState,
  ItemCard,
  LocationCard,
  PersonCard,
  ProtagonistCard,
  SceneCard,
  SceneDefinition,
  StoryChoice,
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
  generateSceneCard(scene: SceneDefinition, choices: StoryChoice[], input: GeneratorInput): Promise<SceneCard>;
  generateEventCard(event: EventDefinition, choices: StoryChoice[], input: GeneratorInput): Promise<EventCard>;
}

function nowIso() {
  return new Date().toISOString();
}

function stripCodeFence(raw: string) {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

const SCENE_CARD_CACHE_VERSION = 5;

class TemplateContentGenerator implements ContentGenerator {
  async generateLocationCard(locationId: string, input: GeneratorInput) {
    const registry = buildRuntimeRegistry(input.state);
    const location = registry.locations[locationId];
    const availableActionIds = (location.interactionChoices ?? []).map((choice) => choice.id);
    return LocationCardSchema.parse({
      id: location.id,
      name: location.name,
      risk: location.risk,
      summary: location.summary,
      description: `${location.summary} ${summarizeState(input.state).phase.toLowerCase()}의 공기는 이곳의 먼지와 기척을 더 또렷하게 드러낸다.`,
      tags: [...location.tags],
      traits: [...location.traits],
      obtainableItemIds: [...location.obtainableItemIds],
      residentIds: [...location.residentIds],
      neighbors: [...location.neighbors],
      imagePath: location.imagePath,
      source: "template",
      generatedAt: nowIso(),
      availableActionIds,
      eventIds: [...location.eventIds],
    });
  }

  async generatePersonCard(personId: string, _input: GeneratorInput) {
    const registry = buildRuntimeRegistry(_input.state);
    const person = registry.people[personId] as Omit<PersonCard, "source" | "generatedAt"> | undefined;
    if (!person) {
      throw new Error(`Unknown person '${personId}'.`);
    }
    return PersonCardSchema.parse({
      ...person,
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateItemCard(itemId: string, _input: GeneratorInput) {
    const registry = buildRuntimeRegistry(_input.state);
    const item = registry.items[itemId] as Omit<ItemCard, "source" | "generatedAt"> | undefined;
    if (!item) {
      throw new Error(`Unknown item '${itemId}'.`);
    }
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
      name: "Unnamed Survivor",
      summary: "A survivor trying to turn each day into one more chance to get through the city.",
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

  async generateSceneCard(scene: SceneDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return SceneCardSchema.parse({
      id: `scene:${scene.id}:v${SCENE_CARD_CACHE_VERSION}:${input.state.day}:${input.state.phaseIndex}`,
      eventId: scene.eventId,
      locationId: scene.locationId,
      title: `${scene.title} (${PHASES[input.state.phaseIndex]})`,
      paragraphs: scene.paragraphs,
      introFlag: scene.introFlag,
      choices,
      materialIds: {
        locationIds: input.storyMaterials.locations.map((entry) => entry.id),
        personIds: input.storyMaterials.people.map((entry) => entry.id),
        itemIds: input.storyMaterials.items.map((entry) => entry.id),
      },
      source: "template",
      generatedAt: nowIso(),
    });
  }

  async generateEventCard(event: EventDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return EventCardSchema.parse({
      id: `event:${event.id}:${input.state.day}:${input.state.phaseIndex}`,
      locationId: event.locationId,
      title: event.title,
      summary: event.summary,
      trigger: `${input.state.day} / ${PHASES[input.state.phaseIndex]}`,
      choices,
      rewards: [],
      flags: [`event_seen_${event.id}`],
      startSceneId: event.startSceneId,
      sceneIds: event.sceneIds,
      source: "template",
      generatedAt: nowIso(),
      triggerConditions: event.triggerConditions,
      choiceIds: event.choiceIds,
      once: event.once,
      priority: event.priority,
    });
  }
}

class GenericRemoteContentGenerator implements ContentGenerator {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallback: TemplateContentGenerator,
  ) {}

  private async generateJson<T>(schemaName: string, schemaPrompt: string, payload: Record<string, unknown>): Promise<T> {
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
            content: `You generate JSON only. Output must satisfy this schema: ${schemaPrompt}. Do not change action ids or choice wiring. Keep the root "id" field exactly equal to payload.fallback.id. Focus only on the current location and local materials. Improve prose only.`,
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

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM did not return content.");
    }

    return JSON.parse(stripCodeFence(content)) as T;
  }

  private async withFallback<T>(work: () => Promise<T>, fallback: () => Promise<T>) {
    try {
      return await work();
    } catch {
      return fallback();
    }
  }

  async generateLocationCard(locationId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateLocationCard(locationId, input);
        return LocationCardSchema.parse(await this.generateJson("locationCard", "location card json", { fallback, currentState: summarizeState(input.state) }));
      },
      () => this.fallback.generateLocationCard(locationId, input),
    );
  }

  async generatePersonCard(personId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generatePersonCard(personId, input);
        return PersonCardSchema.parse(await this.generateJson("personCard", "person card json", { fallback, currentState: summarizeState(input.state) }));
      },
      () => this.fallback.generatePersonCard(personId, input),
    );
  }

  async generateItemCard(itemId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateItemCard(itemId, input);
        return ItemCardSchema.parse(await this.generateJson("itemCard", "item card json", { fallback, currentState: summarizeState(input.state) }));
      },
      () => this.fallback.generateItemCard(itemId, input),
    );
  }

  async generateProtagonistCard(input: GeneratorInput) {
    // This card reflects live stats and is regenerated on nearly every request,
    // so using a remote model here only adds latency without meaningful gain.
    return this.fallback.generateProtagonistCard(input);
  }

  async generateSceneCard(scene: SceneDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateSceneCard(scene, choices, input);
        const generated = await this.generateJson<SceneCard>("sceneCard", "scene card json", {
          fallback,
          currentState: summarizeState(input.state),
          recentLog: input.recentLog,
          storyMaterials: input.storyMaterials,
          choiceIds: choices.map((choice) => choice.id),
        });
        return SceneCardSchema.parse({
          ...generated,
          id: fallback.id,
          locationId: scene.locationId,
          choices,
          eventId: scene.eventId,
          introFlag: scene.introFlag,
        });
      },
      () => this.fallback.generateSceneCard(scene, choices, input),
    );
  }

  async generateEventCard(event: EventDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateEventCard(event, choices, input);
        const generated = await this.generateJson<EventCard>("eventCard", "event card json", {
          fallback,
          currentState: summarizeState(input.state),
          recentLog: input.recentLog,
          storyMaterials: input.storyMaterials,
          choiceIds: choices.map((choice) => choice.id),
        });
        return EventCardSchema.parse({
          ...generated,
          id: fallback.id,
          locationId: event.locationId,
          choices,
          startSceneId: event.startSceneId,
          sceneIds: event.sceneIds,
        });
      },
      () => this.fallback.generateEventCard(event, choices, input),
    );
  }
}

class GeminiContentGenerator implements ContentGenerator {
  constructor(private readonly fallback: TemplateContentGenerator) {}

  private async generateJson<T>(schemaName: string, schemaPrompt: string, payload: Record<string, unknown>) {
    return generateGeminiJson<T>(
      `You generate JSON only for a survival text RPG.
Output must satisfy this schema description: ${schemaPrompt}.
Do not change action ids or choice wiring.
Keep the root "id" field exactly equal to payload.fallback.id.
Focus only on the current location and local materials.
Improve prose only.
Return valid JSON with no markdown fences.`,
      { schemaName, payload },
      {
        model: geminiModel(),
        temperature: 0.8,
      },
    );
  }

  private async withFallback<T>(work: () => Promise<T>, fallback: () => Promise<T>) {
    try {
      return await work();
    } catch {
      return fallback();
    }
  }

  async generateLocationCard(locationId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateLocationCard(locationId, input);
        return LocationCardSchema.parse(
          await this.generateJson("locationCard", "location card json", {
            fallback,
            currentState: summarizeState(input.state),
          }),
        );
      },
      () => this.fallback.generateLocationCard(locationId, input),
    );
  }

  async generatePersonCard(personId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generatePersonCard(personId, input);
        return PersonCardSchema.parse(
          await this.generateJson("personCard", "person card json", {
            fallback,
            currentState: summarizeState(input.state),
          }),
        );
      },
      () => this.fallback.generatePersonCard(personId, input),
    );
  }

  async generateItemCard(itemId: string, input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateItemCard(itemId, input);
        return ItemCardSchema.parse(
          await this.generateJson("itemCard", "item card json", {
            fallback,
            currentState: summarizeState(input.state),
          }),
        );
      },
      () => this.fallback.generateItemCard(itemId, input),
    );
  }

  async generateProtagonistCard(input: GeneratorInput) {
    // This card reflects live stats and is regenerated on nearly every request,
    // so using Gemini here only adds latency without meaningful gain.
    return this.fallback.generateProtagonistCard(input);
  }

  async generateSceneCard(scene: SceneDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateSceneCard(scene, choices, input);
        const generated = await this.generateJson<SceneCard>("sceneCard", "scene card json", {
          fallback,
          currentState: summarizeState(input.state),
          recentLog: input.recentLog,
          storyMaterials: input.storyMaterials,
          choiceIds: choices.map((choice) => choice.id),
        });
        return SceneCardSchema.parse({
          ...generated,
          id: fallback.id,
          locationId: scene.locationId,
          choices,
          eventId: scene.eventId,
          introFlag: scene.introFlag,
        });
      },
      () => this.fallback.generateSceneCard(scene, choices, input),
    );
  }

  async generateEventCard(event: EventDefinition, choices: StoryChoice[], input: GeneratorInput) {
    return this.withFallback(
      async () => {
        const fallback = await this.fallback.generateEventCard(event, choices, input);
        const generated = await this.generateJson<EventCard>("eventCard", "event card json", {
          fallback,
          currentState: summarizeState(input.state),
          recentLog: input.recentLog,
          storyMaterials: input.storyMaterials,
          choiceIds: choices.map((choice) => choice.id),
        });
        return EventCardSchema.parse({
          ...generated,
          id: fallback.id,
          locationId: event.locationId,
          choices,
          startSceneId: event.startSceneId,
          sceneIds: event.sceneIds,
        });
      },
      () => this.fallback.generateEventCard(event, choices, input),
    );
  }
}

export function createContentGenerator() {
  const fallback = new TemplateContentGenerator();
  if (hasGeminiConfig()) {
    return new GeminiContentGenerator(fallback);
  }

  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiUrl || !apiKey) {
    return fallback;
  }

  return new GenericRemoteContentGenerator(apiUrl, apiKey, model, fallback);
}

export function createTemplateContentGenerator(): ContentGenerator {
  return new TemplateContentGenerator();
}
