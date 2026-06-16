import type {
  ContentRegistry,
  GameState,
  NarrativeAnchorDraft,
  NarrativeContinuationRequest,
  NarrativeSceneDraft,
  WorldPlan,
} from "./schemas";

export type PlannerSource = "llm" | "template";

export type PlannerInput = {
  gameId: string;
  state: GameState;
  registry: ContentRegistry;
  sourceLocationId: string;
  sourceFrontierActionId: string;
  sequence: number;
  recentLog: string[];
};

export type StoryBeatPlannerInput = NarrativeContinuationRequest & {
  state: GameState;
  registry: ContentRegistry;
};

export interface WorldPlanner {
  generateAnchorDraft(input: PlannerInput): Promise<NarrativeAnchorDraft>;
  generateSceneDraft(request: StoryBeatPlannerInput): Promise<NarrativeSceneDraft>;
  planTomorrow(state: GameState, registry: ContentRegistry, gameId: string): Promise<WorldPlan["tomorrow"]>;
}
