import { hasGeminiConfig } from "./gemini-client";
import { GeminiWorldPlanner } from "./gemini-world-planner";
import { buildTomorrowPlanFromDynamicWorld } from "./narrative-planner-fallback";
import { TemplateWorldPlanner } from "./template-world-planner";
import type { GameState, GeneratedRegionPackage, PlannedRegionSummary } from "./schemas";
import type { PlannerInput, StoryBeatPlannerInput, WorldPlanner } from "./narrative-planner-types";

export type { PlannerInput, StoryBeatPlannerInput, WorldPlanner } from "./narrative-planner-types";

export function createWorldPlanner(): WorldPlanner {
  const fallback = new TemplateWorldPlanner();
  if (process.env.ENABLE_LLM_WORLD_PLANNER === "true" && hasGeminiConfig()) {
    return new GeminiWorldPlanner(fallback);
  }
  return fallback;
}

export function summarizeWorldPlan(state: GameState) {
  return buildTomorrowPlanFromDynamicWorld(state)?.notes ?? [];
}

export function buildPlannedRegionSummary(input: PlannerInput, pkg: GeneratedRegionPackage): PlannedRegionSummary {
  return {
    locationId: pkg.locationId,
    sourceLocationId: input.sourceLocationId,
    sourceFrontierActionId: input.sourceFrontierActionId,
    title: pkg.title,
    summary: pkg.summary,
    createdDay: input.state.day,
  };
}
