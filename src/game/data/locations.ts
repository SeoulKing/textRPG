import type { LocationDefinition } from "../schemas";

type LocationMap = Record<string, LocationDefinition>;

export const baseLocations: LocationMap = {
  shelter: {
    id: "shelter",
    name: "임시 거처",
    risk: "safe",
    imagePath: "assets/scenes/shelter.png",
    summary: "지친 생존자들이 잠시 등을 기대는 곳. 초라하지만, 바깥보다 먼저 생각할 수 있는 드문 공간이다.",
    tags: ["hub", "safe", "rest"],
    traits: ["rest", "cooking", "rumor gathering"],
    obtainableItemIds: ["emergencySnack", "waterBottle"],
    residentIds: [],
    neighbors: ["convenience", "kitchen"],
    availableActionIds: ["survey_shelter", "rest_at_shelter", "cook_simple_meal"],
    eventIds: [],
    links: {
      convenience: { note: "무너진 보도와 깨진 유리 조각을 밟으며 편의점 쪽으로 간다." },
      kitchen: { note: "새벽부터 줄이 늘어서는 급식소 방향으로 발길을 옮긴다." },
    },
    stockNodes: [],
  },
  convenience: {
    id: "convenience",
    name: "편의점 잔해",
    risk: "low",
    imagePath: "assets/scenes/convenience.png",
    summary: "반쯤 무너진 가게 안에, 누군가 급히 놓치고 간 생활의 흔적이 아직 남아 있다.",
    tags: ["supplies", "early scavenging"],
    traits: ["food", "water", "light danger"],
    obtainableItemIds: ["emergencySnack", "cannedFood", "rawRice", "vegetables", "waterBottle"],
    residentIds: [],
    neighbors: ["shelter"],
    availableActionIds: ["survey_convenience"],
    eventIds: [],
    links: {
      shelter: { note: "무심한 발걸음처럼 가장한 채 거처 쪽으로 되돌아간다." },
    },
    stockNodes: [
      {
        id: "convenience_shelf",
        name: "진열대",
        summary: "무너진 선반 안쪽에 아직 손이 닿지 않은 통조림 몇 개가 남아 있다.",
        items: [
          { itemId: "cannedFood", initialQuantity: 3 },
        ],
      },
    ],
  },
  kitchen: {
    id: "kitchen",
    name: "급식소",
    risk: "low",
    imagePath: "assets/scenes/kitchen.png",
    summary: "한 끼의 온기와 내일에 대한 소문이 함께 오가는 배식 거점이다.",
    tags: ["food", "water"],
    traits: ["meal purchase", "rumors", "trading"],
    obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables"],
    residentIds: ["oldCook"],
    neighbors: ["shelter"],
    availableActionIds: ["survey_kitchen", "buy_meal_at_kitchen"],
    eventIds: [],
    links: {
      shelter: { note: "연기 냄새가 배어 있는 길을 따라 거처로 돌아간다." },
    },
    stockNodes: [],
  },
};

export type BaseLocation = LocationDefinition;
