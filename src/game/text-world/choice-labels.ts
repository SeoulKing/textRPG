import { defaultChoiceThought, validChoiceThought } from "./choice-thoughts";
import { z } from "zod";
import { rememberChoices } from "./choice-director";
import type { NarrativeContext, TextWorld } from "../schemas/text-world";
import { worldRooms } from "./world";
type Option = { id: string; label: string; family?: string; targetId?: string; selectionSignature?: string };
export type ChoiceLabel = { optionId: string; label: string; thought: string; thoughtSource: "template" | "llm"; source: "template" | "llm" };
export function nextNarrativeChoices(world: TextWorld, options: Option[]) {
  return options.map(option => ({ id: option.id, label: option.label, family: option.family, targetId: option.targetId, selectionSignature: option.selectionSignature, defaultThought: defaultChoiceThought(world, option), labelNames: [...Object.values(world.entities).map(e=>e.name), ...Object.values(worldRooms(world)).map(r=>r.name.split(" · ").at(-1)!)].filter(name=>name && option.label.includes(name)) }));
}
export function choiceLabelFields(world: TextWorld, option: Option) {
  const saved = world.choiceLabels?.[option.id];
  const current = saved?.canonical === option.label ? saved : undefined;
  return { label: current?.text ?? option.label, choiceThought: current?.thought ?? defaultChoiceThought(world, option), choiceThoughtSource: current?.thoughtSource ?? "template" as const };
}
const LabelSchema = z.object({ optionId: z.string(), label: z.string().trim().min(1).max(90), thought: z.string().trim().optional(), thoughtSource: z.enum(["template", "llm"]).optional(), source: z.enum(["template", "llm"]).optional() });
export function resolveChoiceLabels(context: NarrativeContext, raw: unknown): ChoiceLabel[] {
  const entries = Array.isArray(raw) ? raw : [];
  return (context.nextChoices ?? []).map(option => {
    const matching = entries.filter(entry=>entry?.optionId === option.id);
    const parsed = matching.length === 1 ? LabelSchema.safeParse(matching[0]) : null;
    const label = parsed?.success ? parsed.data.label : undefined;
    const verb = option.family === "ATTACK" ? /공격|친다|휘두|내리|찌르|겨눈/ : option.family === "NEGOTIATE" ? /말|설득|대화|진정/ : option.id.startsWith("journey:") ? /내려|올라|돌아|진입|들어|향/ : option.family === "TRADE" ? /산다|사 둔다|구입|구매|바꾼|교환/ : option.id.startsWith("delivery:") ? /건넨|건네|맡긴|전달/ : /^(work|care):/.test(option.id) ? /돕|도울|보탠|거든|거들|정찰|처치|돌본|치료|작업|수리|보수/ : option.family === "HANDLE" ? option.id.startsWith("stow:") ? /챙겨|보관/ : /꺼내|고쳐|쥐|쥔|든다/ : /^(harvest|toolwork):/.test(option.id) ? /벌목|모으|모은|구하|구한|수색|뒤지|뒤진|꼬|잘라|낚|손질|작업/ : option.id.startsWith("defocus") ? /시선|관심/ : option.family === "PLACE_OBJECT" ? /넣|놓|내려|담/ : option.family === "MOVE_OBJECT" ? /밀|옮/ : option.family === "COLLECT" ? /챙|집|쥐|거두|수거|꺼내/ : option.family === "TOOL" ? /켜|켠|끄|끈|비추|비춘|집어/ : option.family === "OPEN_CONTAINER" || option.family === "ACCESS" ? /열|닫|살피|살펴|확인|잠금/ : /살피|살펴|시선|관심|다가|이동|돌아|향|나온|나서|기다|숨|낮춰/;
    const validLabel = label && !/[\n\r.!?]|당신|플레이어|주인공|발견했다|획득했다|성공|실패|(?:result|entity|contents):/.test(label) && (option.id.startsWith("repair:") ? /수리|손본|보수/.test(label) : option.id.startsWith("tool:") ? /열|벌려|자르|잘라|부수|충격/.test(label) : verb.test(label))
      && (option.labelNames ?? []).every(name => label.includes(name))
      && (!option.label.includes("꺼내 손에") || label.includes("꺼내"))
      && (option.family !== "HANDLE" || !/내려놓|바닥|위에 놓|안에 넣|버린/.test(label))
      && (!option.label.includes("안에 넣") || /안|속|넣|담/.test(label))
      && (!option.label.includes("위에 놓") || /위에|위로/.test(label))
      && (!option.label.includes("닫는다") || /닫/.test(label))
      && (!/열어|연다/.test(option.label) || /열|연다/.test(label))
      && (!/켜|켠다/.test(option.label) || /켜|켠다/.test(label))
      && (!/끈다/.test(option.label) || /끄|끈다/.test(label));
    const thought = parsed?.success ? parsed.data.thought : undefined;
    const validThought = validChoiceThought(thought);
    return { optionId: option.id, thought: validThought ? thought : option.defaultThought ?? "가까이서 보면 더 알 수 있겠지.", thoughtSource: validThought && parsed?.success && (parsed.data.thoughtSource ?? parsed.data.source) !== "template" ? "llm" : "template", label: validLabel ? label : option.label, source: validLabel && parsed?.success && parsed.data.source !== "template" ? "llm" : "template" };
  });
}
export function storeChoiceLabels(world: TextWorld, context: NarrativeContext, raw: unknown) {
  rememberChoices(world, context.nextChoices ?? []);
  world.choiceLabels = Object.fromEntries(resolveChoiceLabels(context, raw).map(choice => [choice.optionId, { canonical: context.nextChoices!.find(o=>o.id===choice.optionId)!.label, text: choice.label, thought: choice.thought, thoughtSource: choice.thoughtSource }]));
  delete world.choiceNarratives;
}
