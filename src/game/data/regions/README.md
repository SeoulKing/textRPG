# Region Authoring

지역 콘텐츠는 `src/game/data/regions/<regionId>/` 아래에 둡니다. 새 지역을 작게 시작할 때 필요한 최소 파일은 보통 세 개입니다.

```text
<regionId>/
  index.ts
  location.ts
  scenes.ts
```

상세 선택지나 이벤트가 필요해질 때만 `choices.ts`, `events.ts`를 추가합니다. 비어 있는 파일은 만들지 않아도 됩니다.

## index.ts

`defineRegion()`이 빈 선택지/이벤트 배열을 자동으로 채웁니다.

```ts
import { defineRegion } from "../types";
import { forestLocation } from "./location";
import { forestSceneDefinitions } from "./scenes";

export const forestRegion = defineRegion({
  location: forestLocation,
  scenes: forestSceneDefinitions,
});
```

선택지나 이벤트가 있다면 필요한 것만 추가합니다.

```ts
export const shelterRegion = defineRegion({
  location: shelterLocation,
  choices: shelterChoiceDefinitions,
  events: shelterEventDefinitions,
  scenes: shelterSceneDefinitions,
});
```

## location.ts

장소 자체와 장소에서 바로 보이는 상호작용을 정의합니다. `defineLocation()`이 `residentIds`, `eventIds`, `interactionChoices`, `stockNodes` 같은 빈 기본값을 채우므로 필요한 필드만 적습니다.

```ts
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const forestChoices = [
  interactionFor("forest", {
    id: "chop_wood_at_forest",
    label: "벌목하기",
    type: "search",
    effects: [
      { type: "advance_time", minutes: 30 },
      { type: "add_item", itemId: "woodPlank", amount: 3 },
    ],
    tags: ["resource", "repeatable"],
    riskHint: "low",
  }),
];

export const forestLocation = defineLocation({
  id: "forest",
  name: "숲",
  risk: "low",
  summary: "...",
  tags: ["resource"],
  traits: ["foraging"],
  obtainableItemIds: ["woodPlank"],
  neighbors: ["shelter"],
  interactionChoices: forestChoices,
  links: {
    shelter: { note: "임시 거처로 돌아간다." },
  },
});
```

재고 노드를 추가할 때는 `stockNode()`를 쓰면 `money: 0`이나 `items: []`를 매번 적지 않아도 됩니다.

```ts
stockNode({
  id: "forest_supply_cache",
  name: "버려진 보급 상자",
  summary: "젖은 낙엽 아래에 작은 상자가 반쯤 묻혀 있다.",
  items: [{ itemId: "clothScrap", initialQuantity: 2 }],
});
```

## scenes.ts

장소 설명, 행동 결과, 컨테이너 상세 같은 본문 텍스트를 둡니다. 반복 행동 결과를 여러 문장으로 흔들고 싶다면 씬에 같은 `tags`를 붙이고, 액션에서는 `set_random_scene`으로 그 태그를 참조합니다.

```ts
{
  id: "forest_chop_result_1",
  locationId: "forest",
  title: "벌목",
  tags: ["forest:result:chop"],
  paragraphs: ["..."],
  choiceIds: [],
  conditions: [{ type: "location", locationId: "forest" }],
}
```

```ts
{ type: "set_random_scene", tag: "forest:result:chop" }
```

이렇게 하면 액션 파일이 개별 씬 id 목록을 알 필요가 없습니다. 새 결과 씬을 추가할 때는 같은 태그만 붙이면 자동 후보가 됩니다.

## choices.ts

씬 안에서만 보이는 선택지가 필요할 때 추가합니다. `sceneChoice()`가 기본값을 채우므로 `conditions`, `hidden`, `presentationMode`, `failureEffects`를 매번 적지 않아도 됩니다.

```ts
import { sceneChoice } from "../../scene-choice-helpers";

export const hospitalChoiceDefinitions = [
  sceneChoice({
    id: "collect_pain_relief_from_hospital",
    label: "진통제를 챙긴다",
    effects: [
      { type: "advance_time", minutes: 15 },
      { type: "add_item", itemId: "painRelief", amount: 1 },
    ],
  }),
];
```

재고 노드에서 아이템을 챙기는 선택지는 `collectStockItemChoiceParts()`를 쓰면 조건과 효과를 한 번에 만들 수 있습니다.

```ts
import { collectStockItemChoiceParts, leaveStockNodeChoiceParts } from "../../stock-node-choice-helpers";

const medicineCabinet = { locationId: "hospital", nodeId: "hospital_medicine_cabinet" } as const;

sceneChoice({
  id: "collect_pain_relief_from_hospital",
  label: "진통제를 챙긴다",
  ...collectStockItemChoiceParts({
    ...medicineCabinet,
    itemId: "painRelief",
    logMessage: "당신은 상자에 남은 진통제를 조심스럽게 챙긴다.",
    minutes: 15,
  }),
});

sceneChoice({
  id: "leave_hospital_medicine_cabinet",
  label: "보관함에서 물러선다",
  ...leaveStockNodeChoiceParts(medicineCabinet.nodeId, "당신은 보관함 문을 닫는다."),
});
```

## 선택지 힌트 포맷

선택지 아래에 실제 효과를 보여줘야 할 때만 `showOutcomeHint: true`를 켭니다. 이때 `outcomeHint`는 자동 생성하지 않고, 콘텐츠 작성자가 직접 아래 순서로 씁니다.

```text
소모하거나 내는 것 / 얻거나 회복하는 것 / 걸리는 시간
```

예시는 다음과 같습니다.

```ts
outcomeHint: "-1,800원 / +2 체력 / +15분",
outcomeHint: "-4,500원 / +1 따뜻한 식사 / +15분",
outcomeHint: "+3 목재 판자 / +30분",
```

돈, 아이템, 체력, 정신력, 기력처럼 플레이어가 바로 판단해야 하는 값만 짧게 적습니다. 시간은 항상 맨 마지막에 둡니다. 확률과 허탕 가능성은 선택지 힌트에 표시하지 않고, 찾을 수 있는 것만 적습니다. 서사 설명이나 분위기 문장은 선택지 힌트가 아니라 씬 본문과 로그에 둡니다.

## 검증

콘텐츠를 수정한 뒤에는 최소한 아래 명령을 돌립니다.

```powershell
npm.cmd run typecheck
npm.cmd run content:validate
npm.cmd run build
```
