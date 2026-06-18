# Data Authoring

게임의 손제작 데이터는 이 폴더에서 관리합니다.

## Items

아이템은 `items.ts`에 추가합니다. `defineItem()`이 기본 효과값을 모두 0으로 채우므로, 회복 효과가 없는 재료나 부품은 `effects`를 생략할 수 있습니다.

```ts
defineItem({
  id: "scrapMetal",
  name: "고철 조각",
  description: "간이 제작과 수리에 쓰이는 금속 부품이다.",
  kind: "material",
  rarity: "common",
  price: 900,
  tags: ["재료", "금속", "제작"],
});
```

회복 아이템은 바뀌는 수치만 적습니다.

```ts
defineItem({
  id: "cannedFood",
  name: "캔 음식",
  description: "차갑지만 든든한 한 끼를 대신할 수 있다.",
  kind: "food",
  rarity: "common",
  price: 2500,
  tags: ["식량", "보존식"],
  effects: { energy: 5, exhaustionRelief: 2 },
  useMinutes: 10,
});
```

## Regions

장소, 장소 액션, 장면, 씬 선택지는 `regions/<regionId>/` 아래에 둡니다. 자세한 작성 방식은 `regions/README.md`를 봅니다.
