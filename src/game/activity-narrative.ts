import type { ActionDefinition, ChoiceDefinition, ContentRegistry, GameState } from "./schemas";
import { resolveItemText } from "./item-text";

type ActivityDefinition = Pick<ActionDefinition | ChoiceDefinition, "label" | "activity">;
/** Static intentions need no narrator request; actual outcomes remain in the completed scene. */
export function activityThoughtFields(definition: Pick<ActivityDefinition, "activity">) {
  const kind = definition.activity?.kind;
  if (!kind) return {};
  const thoughts = {
    craft: "이걸 만들어 두면 쓸 일이 있겠지.",
    cook: "먹을 것을 좀 준비해 둘까.",
    build: "조금 더 쓸 만하게 만들어 보자.",
    rest: "지금은 몸을 좀 쉬게 해 두자.",
  };
  return { choiceThought: thoughts[kind], choiceThoughtSource: "template" as const };
}

/** Only text from executed completion effects belongs in the reading scene. */
export function workActivityParagraphs(
  definition: ActivityDefinition, result: NonNullable<GameState["lastActivity"]>,
  executedParagraphs: string[], registry: ContentRegistry,
): string[] {
  const label = resolveItemText(definition.label, registry);
  if (result.status === "interrupted") {
    const inputsUsed = Object.keys(result.consumedItems).length > 0 || result.moneySpent > 0;
    return [label + " 작업을 시작하지만 끝내기 전에 멈춘다." + (inputsUsed ? " 이미 투입한 재료와 비용은 사용한 상태로 남는다." : "") + " 완성품이나 설비는 만들어지지 않는다."];
  }
  const paragraphs = executedParagraphs.map(text => resolveItemText(text, registry)
    .replace(/(^|[.!?]\s+)당신은\s*/g, "$1").trim()).filter(Boolean);
  if (!paragraphs.length) return [label + " 작업을 마친다."];
  return paragraphs.length <= 3 ? paragraphs : [...paragraphs.slice(0, 2), paragraphs.slice(2).join(" ")];
}
