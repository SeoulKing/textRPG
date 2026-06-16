import type { ContentRegistry, GameState, WorldPlan } from "./schemas";
import type { PlannerInput, StoryBeatPlannerInput, WorldPlanner } from "./narrative-planner-types";
import { buildFallbackAnchorDraft, buildFallbackSceneDraft, buildTomorrowPlanFromDynamicWorld } from "./narrative-planner-fallback";
import { markDraftPlannerSource } from "./narrative-planner-validation";

export class TemplateWorldPlanner implements WorldPlanner {
  async generateAnchorDraft(input: PlannerInput) {
    return markDraftPlannerSource(buildFallbackAnchorDraft(input), "template");
  }

  async generateSceneDraft(request: StoryBeatPlannerInput) {
    return markDraftPlannerSource(buildFallbackSceneDraft(request), "template");
  }

  async planTomorrow(state: GameState, _registry: ContentRegistry, _gameId: string): Promise<WorldPlan["tomorrow"]> {
    return buildTomorrowPlanFromDynamicWorld(state);
  }
}
