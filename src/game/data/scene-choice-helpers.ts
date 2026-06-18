import type { ChoiceDefinition } from "../schemas";

type SceneChoiceInput = Omit<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects"> &
  Partial<Pick<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects">>;

export function sceneChoice(definition: SceneChoiceInput): ChoiceDefinition {
  return {
    conditions: [],
    hidden: false,
    presentationMode: "when_conditions_met",
    failureEffects: [],
    ...definition,
  };
}
