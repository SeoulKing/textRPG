import type { TextWorld } from "../schemas/text-world";

type ThoughtOption = { id: string; label: string; family?: string; targetId?: string };
/** A question or modest intention, never an advance account of the action's outcome. */
export function defaultChoiceThought(world: TextWorld, option: ThoughtOption): string {
  const kind = option.id.split(":")[0];
  const target = world.entities[option.targetId ?? option.id.slice(kind.length + 1)];
  if (["focus", "explore", "inspect"].includes(kind) && /계산대|카운터|금전/.test(target?.name ?? "")) return "돈이 좀 있을래나.";
  if (["harvest", "toolwork"].includes(kind)) return /낚/.test(option.label) ? "이번에는 입질이 있을까." : /덩굴|끈/.test(option.label) ? "단단한 것만 골라 보자." : "여기서 쓸 만한 걸 더 구할 수 있을까.";
  if(kind==="separate")return "문을 사이에 두면 틈이 생길까.";
  if(kind==="combat")return option.family==="NEGOTIATE" ? "말이 통할 여지는 있을까." : option.family==="RETREAT" ? "지금 틈을 타서 빠져나가자." : option.family==="COVER" ? "다가오는 움직임부터 막아 보자." : "빈틈을 먼저 잡아 보자.";
  if (kind === "throw") return "소리가 나면 그쪽을 돌아볼까.";
  if (kind === "trade") return "지금 쓸 몫을 마련해 둘까.";
  if (kind === "delivery") return "부탁받은 것을 건네 두자.";
  if (kind === "journey") return option.id === "journey:ascend" ? "위층으로 돌아가 볼까." : option.id === "journey:return" ? "이만 들고 돌아가자." : "내려가기 전에 챙길 건 다 챙겼나.";
  if (kind === "information") return "기록에 단서가 있을까.";
  if (kind === "care") return "지금 상처부터 돌봐 두는 게 좋겠지.";
  if (kind === "work") return "여기서 도울 일이 있을까.";
  if (kind === "hold") return "이걸 쓰면 어떨까.";
  if (kind === "stow") return "일단 챙겨 두자.";
  if (kind === "defocus") return "다른 쪽에도 볼 게 남아 있을까.";
  if (kind === "unlock") return "이 열쇠가 맞겠지.";
  if (kind === "tool") return "이 도구로 길을 낼 수 있을까.";
  if (kind === "repair") return "손보면 다시 쓸 수 있겠지.";
  if (kind === "enter") return "안쪽에는 뭐가 남아 있을까.";
  if (["collect", "take"].includes(kind) && /꺼내|다시 집어/.test(option.label)) return "다시 꺼내 볼까.";
  if (["collect", "take"].includes(kind)) return "챙겨 두면 쓸 일이 있겠지.";
  if (["put", "drop"].includes(kind)) return "여기에 두면 손이 좀 편하겠지.";
  if (kind === "push") return "조금 옮기면 자리가 나겠지.";
  if (kind === "wait") return "조금만 지켜보자.";
  if (["hide", "emerge"].includes(kind)) return "이쪽에서는 얼마나 보일까.";
  if (kind === "light") return /끄|끈다/.test(option.label) ? "잠깐 꺼 둬도 괜찮을까." : "빛이 있으면 더 살필 수 있겠지.";
  if (kind === "equip") return "빛을 챙겨 두는 편이 좋겠지.";
  if (["leave", "travel"].includes(kind)) return /돌아/.test(option.label) ? "이쯤에서 돌아가는 게 좋겠지." : "저쪽에는 뭐가 있을까.";
  if (target?.components.container) return "안에 쓸 만한 게 남아 있을까.";
  return "가까이서 보면 더 알 수 있겠지.";
}
export function validChoiceThought(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= 4 && raw.length <= 60
    && !/[\n\r0-9]|[.!?。！？].*\S|당신|플레이어|주인공|발견했|획득|성공|실패|있다|없다|비었다|열렸다|도착했|다쳤|손을 뻗|몸을 낮춘다|다가간다|걸어간다|(?:result|entity|contents):/.test(raw)
    && /(?:까|나|지|텐데|보자|두자|좋겠다|필요하겠다)[.!?]?$/.test(raw.trim());
}
