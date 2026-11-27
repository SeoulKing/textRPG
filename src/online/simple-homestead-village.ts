import { z } from "zod";
import { COOKING_RECIPES } from "../game/arcana-cooking";
import { baseItems } from "../game/data/items";
import { OnlineError } from "./accounts";

const requestIds = ["fish", "wood", "meal"] as const;
type RequestId = typeof requestIds[number];
type Inventory = Readonly<Record<string, number>>;

export const VillageProgressSchema = z.object({
  completed: z.array(z.enum(requestIds)).refine(ids => new Set(ids).size === ids.length),
  lastDay: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).default(() => ({ completed: [], lastDay: 0 }));

export type VillageProgress = z.infer<typeof VillageProgressSchema>;

type VillageReward = { seeds: number; berries: number; herbs: number };

interface VillageRequest {
  title: string;
  detail: string;
  itemName: string;
  itemIds: readonly string[];
  quantity: number;
  unit: string;
  reward: VillageReward;
}

const requests: Record<RequestId, VillageRequest> = {
  fish: {
    title: "여관 주방의 생선 바구니",
    detail: "여관 주인 마르텐이 저녁 수프에 넣을 민물고기를 구합니다.",
    itemName: baseItems.riverFish.name,
    itemIds: [baseItems.riverFish.id],
    quantity: 1,
    unit: "마리",
    reward: { seeds: 1, berries: 0, herbs: 1 },
  },
  wood: {
    title: "광장 벤치 수리",
    detail: "광장에서 쉬어 갈 수 있도록 헐거워진 벤치를 고칠 목재를 모읍니다.",
    itemName: baseItems.wood.name,
    itemIds: [baseItems.wood.id],
    quantity: 2,
    unit: "개",
    reward: { seeds: 1, berries: 1, herbs: 0 },
  },
  meal: {
    title: "숲길에서 돌아온 이웃의 저녁",
    detail: "해 질 무렵 숲에서 돌아오는 이웃에게 따뜻한 생선구이를 건넵니다.",
    itemName: baseItems.grilledFish.name,
    itemIds: COOKING_RECIPES.grilledFish.results,
    quantity: 1,
    unit: "개",
    reward: { seeds: 1, berries: 2, herbs: 0 },
  },
};

function availableRequests(progress: VillageProgress, day: number): readonly RequestId[] {
  const remaining = requestIds.filter(id => !progress.completed.includes(id));
  if (remaining.length > 0) return remaining;
  if (progress.lastDay >= day) return [];
  return [requestIds[(day - 1) % requestIds.length]];
}

function requiredItems({ itemName, quantity, unit }: VillageRequest): string {
  return `${itemName} ${quantity}${unit}`;
}

function rewardText({ seeds, berries, herbs }: VillageReward): string {
  const parts = [`씨앗 ${seeds}개`];
  if (berries > 0) parts.push(`별열매 ${berries}개`);
  if (herbs > 0) parts.push(`달숨풀 ${herbs}개`);
  return parts.join(" · ");
}

export function villageView(
  progress: VillageProgress,
  unlocked: boolean,
  day: number,
  inventory?: Inventory,
) {
  const offers = unlocked ? availableRequests(progress, day).map(id => {
    const request = requests[id];
    const { title, detail, itemIds, quantity, reward } = request;
    const owned = itemIds.reduce((sum, itemId) => sum + (inventory?.[itemId] ?? 0), 0);
    return {
      id, title, detail, owned, quantity,
      need: requiredItems(request),
      reward: rewardText(reward),
      canDeliver: owned >= quantity,
    };
  }) : [];
  return {
    unlocked, offers,
    completed: progress.completed.length,
    total: requestIds.length,
    nextDay: unlocked && offers.length === 0,
  };
}

export function prepareVillageDelivery(
  progress: VillageProgress,
  unlocked: boolean,
  day: number,
  inventory: Inventory | undefined,
  requestId: string,
) {
  if (!unlocked) throw new OnlineError("simple_homestead_village_locked", "참나무지기와의 전투에서 승리하면 마을 납품이 열립니다.");
  const available = availableRequests(progress, day);
  if (available.length === 0) throw new OnlineError("simple_homestead_village_day", "오늘 납품을 마쳤습니다. 집에서 쉬고 다음 날 돌아와 주세요.");
  const id = available.find(candidate => candidate === requestId);
  if (!id) throw new OnlineError("simple_homestead_village_request", "현재 납품할 수 있는 의뢰를 골라 주세요.");
  if (!inventory) throw new OnlineError("simple_homestead_village_inventory", "소지품을 확인할 수 없습니다.");

  const request = requests[id];
  const { itemIds, quantity, reward, title } = request;
  const itemId = itemIds.find(candidate => (inventory[candidate] ?? 0) >= quantity);
  if (!itemId) throw new OnlineError("simple_homestead_village_material", `${requiredItems(request)}가 필요합니다.`);

  const completed = [...progress.completed];
  if (completed.length < requestIds.length) completed.push(id);
  return {
    progress: { completed, lastDay: day },
    itemId,
    quantity,
    ...reward,
    message: `‘${title}’ 납품을 마쳤습니다. ${rewardText(reward)}를 받았습니다.`,
  };
}
