# 객체 모델 설계

이 문서는 텍스트 RPG의 핵심 객체 구조를 정리한 것이다.  
**현재 구조**와 **목표 구조**를 매핑하고, 단계별 마이그레이션 방향을 제시한다.

---

## 1. 핵심 객체 목록

| 객체 | 설명 | 현재 대응 | 우선순위 |
|------|------|----------|----------|
| **GameState** | 세션 전체 상태 (저장/불러오기 단위) | `GameSession` + `GameStateSchema` | 최상 |
| **Player** | 플레이어 상태 (hp, inventory, flags 등) | `GameStateSchema` 내 stats/inventory/flags | 최상 |
| **Location** | 장소 (배경이 아닌 플레이 가능 공간) | `LocationCard` + `baseLocations` | 최상 |
| **Event** | 장면 단위 (텍스트, 이미지, 선택지) | `EventCard`, `SceneCard` | 최상 |
| **Choice** | 선택지 (Event 내 분기) | `StoryChoice`, `ActionChoice` | 최상 |
| **Quest** | 퀘스트 (목표, 보상, 조건) | `baseQuests` + `quests` 상태 | 최상 |
| **WorldState** | 세계 전체 변화 (시간, 해금 등) | `GameState` 내 day/phaseIndex/flags | 최상 |
| **Action** | 공용 행동 (이동, 조사, 사용 등) | `GameAction` + `buildActionCatalog` | 중 |
| **NPC** | 캐릭터 (퀘스트, 대화) | `PersonCard` | 중 |
| **Item** | 아이템 (효과, 태그) | `ItemCard` | 중 |
| **Skill** | 스킬 정의 | `baseSkills` | 중 |
| **Condition** | 조건 규칙 객체 | 없음 (문자열/플래그로 분산) | 권장 |
| **Effect** | 결과 규칙 객체 | `ItemEffects`, `performAction` 내부 | 권장 |

---

## 2. GameState (최상위)

**역할**: 게임 저장/불러오기의 단위. "지금 이 세션이 어디까지 진행됐는가"를 담는다.

### 목표 구조

```json
{
  "player": {},
  "currentLocationId": "camp",
  "currentEventId": "event_camp_intro",
  "worldState": {},
  "activeQuestIds": ["quest_medicine"],
  "completedQuestIds": [],
  "visitedLocationIds": ["camp"],
  "time": "night",
  "turn": 12
}
```

### 현재 구조

- `GameSession`: `id`, `state`, `world`
- `GameStateSchema`: `location`, `day`, `phaseIndex`, `stats`, `inventory`, `flags`, `quests`, `log` 등이 **한 객체에 혼재**

### 매핑

| 목표 필드 | 현재 필드 |
|----------|----------|
| `player` | `state.stats`, `state.inventory`, `state.skills`, `state.flags` → **Player로 분리** |
| `currentLocationId` | `state.location` |
| `currentEventId` | `state.sceneId` 또는 `sceneKey` |
| `worldState` | `state.day`, `state.phaseIndex`, `state.flags` 일부 → **WorldState로 분리** |
| `activeQuestIds` | `state.quests` 중 `active` |
| `completedQuestIds` | `state.quests` 중 `completed` |
| `visitedLocationIds` | `state.flags` 중 `visited_*` |
| `time` | `state.phaseIndex` → PHASES[phaseIndex] |
| `turn` | 없음 (추가 가능) |

---

## 3. Player

**역할**: 플레이어 개인 상태. 선택지 해금의 핵심 기준.

### 목표 구조

```json
{
  "id": "player_1",
  "name": "player",
  "hp": 8,
  "sanity": 6,
  "hunger": 4,
  "money": 120,
  "inventory": ["flashlight", "painkiller"],
  "skills": { "observation": 3, "persuasion": 2 },
  "flags": ["met_doctor", "opened_subway_gate"],
  "statusEffects": ["bleeding"]
}
```

### 현재 구조

- `state.stats`: hp, mind, fullness
- `state.money`
- `state.inventory`
- `state.skills` (배열)
- `state.flags` (객체)

### 매핑

| 목표 필드 | 현재 필드 |
|----------|----------|
| `hp` | `stats.hp` |
| `sanity` | `stats.mind` |
| `hunger` | `stats.fullness` |
| `money` | `money` |
| `inventory` | `inventory` (record → array 변환 가능) |
| `skills` | `skills` (배열 → 레벨 객체 가능) |
| `flags` | `flags` (객체 → 배열 또는 유지) |
| `statusEffects` | 없음 (추가) |

---

## 4. Location

**역할**: 플레이 가능한 공간 단위. 배경이 아니라 행동·이벤트·NPC가 붙는 단위.

### 목표 구조

```json
{
  "id": "hospital_lobby",
  "name": "폐허 병원 로비",
  "shortDescription": "정전된 병원 로비",
  "fullDescription": "천장 일부가 무너져 있고...",
  "image": "locations/hospital_lobby_night.png",
  "neighbors": ["camp", "hospital_2f"],
  "availableActionIds": ["search_reception", "listen_noise"],
  "eventIds": ["event_hospital_intro"],
  "npcIds": ["npc_injured_survivor"],
  "dangerLevel": 3,
  "tags": ["indoor", "medical", "dark"]
}
```

### 현재 구조

- `LocationCard`: id, name, risk, summary, description, tags, traits, obtainableItemIds, residentIds, neighbors, imagePath
- `baseLocations`: links (Record<targetId, LinkDefinition>), requiredFlag

### 매핑

| 목표 필드 | 현재 필드 |
|----------|----------|
| `neighbors` | `links` 키 목록 |
| `availableActionIds` | 없음 (Action과 연동 필요) |
| `eventIds` | 없음 (Event와 연동 필요) |
| `npcIds` | `residentIds` |
| `dangerLevel` | `risk` (문자열 → 숫자 매핑) |

---

## 5. Action

**역할**: 플레이어가 할 수 있는 공용 행동. "버튼" 단위.

### 목표 구조

```json
{
  "id": "search_reception",
  "label": "접수대를 조사한다",
  "type": "search",
  "conditions": [],
  "effects": [
    { "type": "add_item", "itemId": "painkiller", "amount": 1 },
    { "type": "set_flag", "flag": "searched_reception" }
  ],
  "nextEventId": "event_reception_result",
  "tags": ["search", "loot"]
}
```

### 현재 구조

- `GameAction`: travel, use_item, rest, generate_event
- `buildActionCatalog`: links 기반 travel + inventory 기반 use_item + rest + generate_event

### 매핑

- `travel` → Action type: "travel"
- `use_item` → Action type: "use"
- `rest` → Action type: "rest"
- `generate_event` → Action type: "explore" 또는 "event"

---

## 6. Event

**역할**: 특정 상황을 서술하는 장면. 자동으로 뜨는 장면.

### 목표 구조

```json
{
  "id": "event_injured_survivor",
  "locationId": "hospital_lobby",
  "title": "신음소리",
  "text": "접수대 너머에서 낮은 신음소리가 들린다.",
  "triggerConditions": ["flag:hospital_first_visit"],
  "choiceIds": ["choice_approach_survivor", "choice_ignore_survivor"],
  "once": true,
  "priority": 10,
  "tags": ["npc", "story", "medical"]
}
```

### 현재 구조

- `EventCard`: id, locationId, title, summary, trigger, choices, rewards, flags
- `SceneCard`: id, locationId, title, paragraphs, choices (장소+시간 기반 장면)

### 매핑

- `SceneCard` = 장소+시간대별 기본 장면
- `EventCard` = 특정 조건에서 뜨는 이벤트
- `triggerConditions` → `trigger` 문자열 또는 구조화된 Condition[]

---

## 7. Choice

**역할**: Event 안에서 플레이어가 고르는 분기.

### 목표 구조

```json
{
  "id": "choice_approach_survivor",
  "label": "신음소리가 나는 쪽으로 다가간다",
  "descriptionTag": "대화 가능",
  "conditions": [],
  "effects": [
    { "type": "set_flag", "flag": "met_injured_survivor" }
  ],
  "nextEventId": "event_survivor_dialogue",
  "hidden": false,
  "riskHint": "low"
}
```

### 현재 구조

- `StoryChoice`: id, label, outcomeHint, serverActionHint
- `ActionChoice`: id, label, outcomeHint, action

### 매핑

| 목표 필드 | 현재 필드 |
|----------|----------|
| `descriptionTag` | `outcomeHint` (방향만 알려주는 용도) |
| `riskHint` | 없음 (추가) |
| `conditions` | 서버 `actionCatalog` 검증으로 대체 |
| `effects` | `performAction` 내부 로직 |
| `nextEventId` | `serverActionHint`로 서버가 처리 |

---

## 8. Quest

**역할**: 플레이어에게 방향을 주는 객체. 조건·완료 판정 가능.

### 목표 구조

```json
{
  "id": "quest_medicine",
  "title": "약을 구해 와라",
  "description": "캠프의 의사가 진통제와 항생제가 필요하다고 말했다.",
  "type": "main",
  "status": "active",
  "objectives": [
    { "type": "obtain_item", "itemId": "painkiller", "amount": 2 },
    { "type": "return_to_npc", "npcId": "doctor_lee" }
  ],
  "rewards": [
    { "type": "money", "amount": 100 },
    { "type": "set_flag", "flag": "doctor_trust_1" }
  ],
  "prerequisites": [],
  "relatedNpcIds": ["doctor_lee"],
  "relatedLocationIds": ["camp", "hospital_lobby"]
}
```

### 현재 구조

- `baseQuests`: id, name, summary
- `state.quests`: Record<questId, "inactive"|"active"|"completed">
- 완료 판정: `syncQuestState`에서 flags 기반

### 매핑

- `objectives` → flags (mealSecured, waterSecured 등)로 분산
- `rewards` → performAction 내부
- 구조화된 objectives/rewards로 통일 권장

---

## 9. WorldState

**역할**: 플레이어 개인과 별개로 세계 전체의 변화.

### 목표 구조

```json
{
  "currentTime": "night",
  "currentDay": 3,
  "globalFlags": ["checkpoint_closed", "rumor_bunker_spread"],
  "unlockedLocations": ["camp", "hospital_lobby", "market_ruins"],
  "factionStates": { "militia": 1, "traders": 0 },
  "worldEvents": ["night_raids_active"]
}
```

### 현재 구조

- `state.day`, `state.phaseIndex`
- `state.flags` (visited_*, known_*, alleyRouteOpened 등)
- `state.worldElapsedMs`

### 매핑

| 목표 필드 | 현재 필드 |
|----------|----------|
| `currentTime` | PHASES[phaseIndex] |
| `currentDay` | day |
| `globalFlags` | flags 중 world 관련 |
| `unlockedLocations` | flags 중 known_*, visited_* |
| `factionStates` | 없음 (추가) |
| `worldEvents` | 없음 (추가) |

---

## 10. Condition / Effect (공통 규칙)

**역할**: 조건과 결과를 문자열이 아닌 구조화된 객체로 관리.

### Condition 예시

```json
{ "type": "has_item", "itemId": "flashlight", "amount": 1 }
{ "type": "skill_gte", "skillId": "observation", "value": 3 }
{ "type": "flag", "flag": "met_doctor" }
{ "type": "location", "locationId": "camp" }
```

### Effect 예시

```json
{ "type": "change_stat", "stat": "hp", "value": -2 }
{ "type": "set_flag", "flag": "opened_hidden_room" }
{ "type": "add_item", "itemId": "painkiller", "amount": 1 }
{ "type": "travel", "locationId": "hospital_lobby" }
```

### 현재 구조

- 조건: `requiredFlag`, `link?.requiredFlag` 등 문자열/플래그로 분산
- 결과: `performAction`, `useItem`, `adjustStat` 등 함수 내부에 하드코딩

---

## 11. 마이그레이션 단계

### Phase 1: 최소 객체 안정화 ✅ (구현 완료)

1. **Condition / Effect 스키마** 정의 → `schemas.ts`에 추가
2. **Player** 객체 분리 → `PlayerSchema`, `derivePlayer(state)`
3. **WorldState** 객체 분리 → `WorldStateSchema`, `deriveWorldState(state)`
4. **GameStateV2** → `toGameStateV2(state)`로 변환
5. **Condition 평가** → `evaluateCondition(condition, state)`
6. **Effect 적용** → `applyEffect(effect, state)`

구현 파일: `src/game/schemas/` (객체별 분리), `src/game/state-utils.ts`

### 기본 데이터 파일 구조 (`src/game/data/`)

| 파일 | 내용 |
|------|------|
| `items.ts` | baseItems (아이템 정의) |
| `locations.ts` | baseLocations (장소 정의) |
| `people.ts` | basePeople (인물/NPC 정의) |
| `index.ts` | re-export |

### 스키마 파일 구조 (`src/game/schemas/`)

| 파일 | 객체 |
|------|------|
| `base.ts` | RiskSchema |
| `condition-effect.ts` | Condition, Effect |
| `quest.ts` | Objective, QuestReward, QuestDefinition, QuestState |
| `action.ts` | GameAction, ActionDefinition |
| `player.ts` | Player |
| `world-state.ts` | WorldState |
| `game-state.ts` | GameState, GameStateV2 |
| `location.ts` | LocationCard |
| `item.ts` | ItemCard, ItemEffects |
| `person.ts` | PersonCard, ProtagonistCard |
| `choice.ts` | StoryChoice, ActionChoice |
| `event.ts` | EventCard |
| `scene.ts` | SceneCard |
| `session.ts` | GameSession, WorldInstance, StateSnapshot, MapEntry 등 |
| `index.ts` | 전체 re-export |

### Phase 2: Location / Event / Choice 강화 ✅ (구현 완료)

1. **Location**에 `availableActionIds`, `eventIds` 추가 → `LocationCardSchema`, `TemplateContentGenerator`
2. **Event**에 `triggerConditions` (Condition[]), `choiceIds`, `once`, `priority` 추가 → `EventCardSchema`
3. **Choice**에 `conditions`, `effects`, `descriptionTag`, `riskHint`, `hidden`, `nextEventId` 추가 → `StoryChoiceSchema`

### Phase 3: Quest / Action 구조화 ✅ (구현 완료)

1. **Quest**에 `objectives`, `rewards`, `prerequisites` 구조화
   - `ObjectiveSchema`, `QuestRewardSchema`, `QuestDefinitionSchema`
   - `quest-definitions.ts`: meal, water, rumor, anomaly, survive
   - `evaluateObjective`, `applyQuestReward` in state-utils
   - `syncQuestState`가 questDefinitions 기반으로 완료 판정
2. **Action**은 `GameService.buildActionCatalog`에서 동적 생성

---

## 12. 현재 코드와의 호환

- 기존 `GameSession`, `StateSnapshot`, API 응답 형식은 **점진적 마이그레이션** 시 유지 가능
- `buildSnapshot`에서 `player`, `worldState`를 분리해 반환하되, 클라이언트는 기존 `state` 필드도 계속 받을 수 있게 둘 수 있음
- LLM 입력용 `StoryMaterials`는 Player, Location, Item, NPC( Person) 구조를 그대로 활용 가능

---

## 13. 참고: 최소 MVP 객체 세트

```
GameState
Player
Location
Event
Choice
Quest
Item
WorldState
+ Condition (공통)
+ Effect (공통)
```

이 10개를 먼저 안정화한 뒤, Action, NPC, Skill을 확장하는 것을 권장한다.
