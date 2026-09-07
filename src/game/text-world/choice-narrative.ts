import { z } from "zod";
import { rememberChoices } from "./choice-director";
import type { NarrativeContext, TextWorld } from "../schemas/text-world";
import { particle, worldRooms } from "./world";

type Option = { id: string; label: string; family?: string; targetId?: string; selectionSignature?: string };
export type ChoiceNarrative = { optionId: string; text: string; label?: string; source: "template" | "llm" };
export const entryActionLead = "옆쪽 역무실을 살피려고 입구로 시선을 돌린다.";

// Only intent and visible targets: this line must remain true even if the action is rejected.
export function defaultActionLead(world: TextWorld, option: Option): string {
  const [kind, ...parts] = option.id.split(":");
  const remainder = parts.join(":");
  const targetId = ["push", "put"].includes(kind) ? Object.keys(world.entities).filter(id => remainder === id || remainder.startsWith(id + ":")).sort((a, b) => b.length - a.length)[0] ?? remainder : remainder;
  const name = world.entities[targetId]?.name ?? worldRooms(world)[targetId]?.name.split(" · ").at(-1);
  if (kind === "push" && name) return name + " 쪽으로 손을 뻗으며 옮길 자리를 가늠한다.";
  if ((kind === "put" || kind === "drop") && name) return particle(name, "을", "를") + " 내려놓을 자리로 시선을 옮긴다.";
  if (kind === "lid" && name) return name + "의 뚜껑 쪽으로 손을 뻗는다.";
  if ((kind === "hide" || kind === "emerge") && name) return name + " 너머로 시선을 옮길 자리를 가늠한다.";
  if (kind === "defocus") return "시선을 돌릴 방향을 가늠한다.";
  if (kind === "focus" && name) return name + " 쪽으로 눈길을 옮긴다.";
  if (kind === "wait") return "잠시 움직임을 멈추고 주변에 시선을 둔다.";
  if ((kind === "collect" || kind === "take") && option.label.endsWith("챙긴다")) return option.label.replace(/챙긴다$/, "챙기려고 손을 뻗는다.");
  if (kind === "equip" && name) return particle(name, "을", "를") + " 집어 들려고 손을 뻗는다.";
  if (kind === "light" && name) return name + "의 스위치를 누르려고 손가락을 움직인다.";
  if (kind === "unlock" && name) return name + "의 잠금을 풀려고 열쇠를 쥐고 손을 뻗는다.";
  if (kind === "open" && name) return particle(name, "을", "를") + " 열어 보려고 손을 뻗는다.";
  if ((kind === "explore" || kind === "inspect") && name) return particle(name, "을", "를") + " 자세히 살피려고 시선을 모은다.";
  if (kind === "survey") return "벽과 바닥을 살피려고 빛을 옮길 방향을 가늠한다.";
  if (kind === "travel" && name) return name + " 쪽으로 향하려고 발을 뗄 준비를 한다.";
  if (kind === "leave") return "대합실로 돌아가려고 역무실 입구 쪽으로 시선을 옮긴다.";
  return "다음 움직임에 앞서 갈 방향을 가늠한다.";
}

export function nextNarrativeChoices(world: TextWorld, options: Option[]) {
  return options.map(option => ({ id: option.id, label: option.label, actionLead: defaultActionLead(world, option), family: option.family, targetId: option.targetId, selectionSignature: option.selectionSignature, labelNames: [...Object.values(world.entities).map(e => e.name), ...Object.values(worldRooms(world)).map(r => r.name.split(" · ").at(-1)!)].filter(name => name && option.label.includes(name)) }));
}
export function choiceNarrative(world: TextWorld, option: Option) {
  const saved = world.choiceNarratives?.[option.id];
  return saved?.label === option.label ? saved : { label: option.label, text: defaultActionLead(world, option), source: "template" as const, choiceLabel: undefined };
}
export function choiceNarrativeFields(world: TextWorld, option: Option) {
  const lead = choiceNarrative(world, option);
  return { label: lead.choiceLabel ?? option.label, postChoiceNarrative: [lead.text], postChoiceNarrativeSource: lead.source };
}
const LeadSchema = z.object({ optionId: z.string(), text: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(90).optional() });
export function resolveChoiceNarratives(context: NarrativeContext, raw: unknown): ChoiceNarrative[] {
  const entries = Array.isArray(raw) ? raw : [];
  return (context.nextChoices ?? []).map(option => {
    const matching = entries.filter(entry => entry?.optionId === option.id);
    const parsed = matching.length === 1 ? LeadSchema.safeParse(matching[0]) : null;
    const text = parsed?.success ? parsed.data.text : "";
    // Format/obvious outcome checks are local. A bad lead never discards valid result prose or retries Gemini.
    const safe = text && !/[\n\r]|[.!?。！？].*\S|당신|플레이어|주인공|발견|획득|성공|실패|드러[난나]|챙긴다|집어 든다|열린다|잠금이 풀|문을 연다|도착|들어선다|몸을 낮춘다|몸을 일으|안에.{0,30}(?:보인다|있다)|(?:result|entity|contents):/.test(text)
      && /려고|려는|기 위해|기 전|준비|손을 뻗|시선을|시선이|눈길|가늠|손가락|손길/.test(text);
    const label = parsed?.success ? parsed.data.label : undefined;
    const verb = option.id.startsWith("defocus") ? /시선|관심/ : option.family === "PLACE_OBJECT" ? /넣|놓|내려|담/ : option.family === "MOVE_OBJECT" ? /밀|옮/ : option.family === "COLLECT" ? /챙|집|쥐|거두|수거/ : option.family === "TOOL" ? /켜|켠|끄|끈|비추|비춘|집어/ : option.family === "OPEN_CONTAINER" || option.family === "ACCESS" ? /열|닫|살피|살펴|확인|잠금/ : /살피|살펴|시선|관심|다가|이동|돌아|향|나온|나서|기다|숨|낮춰/;
    const validLabel = label && !/[\n\r.!?]|당신|플레이어|주인공|발견했다|획득했다|성공|실패|(?:result|entity|contents):/.test(label) && verb.test(label)
      && (option.labelNames ?? []).every(name => label.includes(name))
      && (!option.label.includes("안에 넣") || /안|속|넣|담/.test(label))
      && (!option.label.includes("위에 놓") || /위에|위로/.test(label))
      && (!option.label.includes("닫는다") || /닫/.test(label))
      && (!/열어|연다/.test(option.label) || /열|연다/.test(label))
      && (!/켜|켠다/.test(option.label) || /켜|켠다/.test(label))
      && (!/끈다/.test(option.label) || /끄|끈다/.test(label));
    return { optionId: option.id, ...(validLabel ? { label } : {}), text: safe ? text : option.actionLead, source: safe && matching[0].source !== "template" ? "llm" : "template" };
  });
}
export function storeChoiceNarratives(world: TextWorld, context: NarrativeContext, raw: unknown) {
  rememberChoices(world, context.nextChoices ?? []);
  const leads = resolveChoiceNarratives(context, raw);
  world.choiceNarratives = Object.fromEntries(leads.map(lead => [lead.optionId, {
    label: context.nextChoices!.find(option => option.id === lead.optionId)!.label, ...(lead.label ? { choiceLabel: lead.label } : {}), text: lead.text, source: lead.source,
  }]));
}
