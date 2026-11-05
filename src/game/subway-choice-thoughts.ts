import type { SubwayChoiceIntent } from "./schemas/subway-encounter";
import { validChoiceThought } from "./text-world/choice-thoughts";

type ThoughtChoice = { intent: SubwayChoiceIntent; thought?: string; thoughtSource?: "llm" | "template" };
export function defaultSubwayChoiceThought(intent: SubwayChoiceIntent): string {
  switch (intent.primary) {
    case "attack": return "어느 쪽에 빈틈이 있을까.";
    case "defend": return "일단 몸부터 지켜야겠지.";
    case "persuade": return "말이 통할 여지가 있을까.";
    case "retreat": return "지금은 물러나는 게 좋겠지.";
    case "use_item": return "이걸 쓰면 도움이 될까.";
    case "interact": return intent.style === "forceful" ? "힘을 써 보면 어떨까." : "천천히 살펴 가는 게 좋겠지.";
    default: return "놓친 단서가 있을까.";
  }
}
export function subwayChoiceThoughtFields(choice: ThoughtChoice) {
  const valid = validChoiceThought(choice.thought);
  return { choiceThought: valid ? choice.thought! : defaultSubwayChoiceThought(choice.intent), choiceThoughtSource: valid ? choice.thoughtSource ?? "template" as const : "template" as const };
}
