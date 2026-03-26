# 프로젝트 구조

이 문서는 현재 코드에 실제로 존재하는 파일과 책임만 정리한 구조 문서다.
설명과 코드가 충돌하면 코드를 기준으로 본다.

## 1. 한눈에 보는 실행 경로

```text
브라우저
  -> src/server.ts
  -> GameService (src/game/service.ts)
  -> rules.ts / content-engine.ts / story-flow.ts
  -> repository.ts or postgres-repository.ts
  -> StateSnapshot 반환
```

액션 요청은 실제로 아래 순서로 흐른다.

1. `src/server.ts`
   `POST /api/games/:gameId/actions`에서 요청을 받고 `GameActionSchema`로 검증한다.
2. `src/game/service.ts`
   `GameService.performAction()`이 세션을 로드하고 `rules.performAction()`을 호출한다.
3. `src/game/rules.ts`
   상태를 변경하고 `syncQuestState()`와 `syncScene()`을 실행한다.
4. `src/game/service.ts`
   카드와 스냅샷을 다시 조립한다.
5. `src/game/story-flow.ts`
   현재 씬 기준으로 보여줄 `StoryChoice[]`를 만든다.
6. `src/game/story-flow.ts`
   `buildActionCatalogFromStoryChoices()`로 `availableActions`를 만든다.

## 2. 디렉터리 구조

### 루트

- `src/server.ts`
  Fastify 서버 진입점. 콘텐츠 검증, 저장소 선택, API 라우트 등록을 맡는다.
- `app-api.js`
  브라우저 쪽 렌더러. 서버가 준 `StateSnapshot`을 화면에 그린다.
- `index.html`
  앱 진입 HTML.
- `styles.css`
  클라이언트 스타일.

### `src/game`

- `service.ts`
  세션 단위 오케스트레이션. 로드, 저장, 카드 보장, 스냅샷 조립을 맡는다.
- `rules.ts`
  `GameState`를 실제로 바꾸는 규칙 실행기다.
- `content-engine.ts`
  씬, 선택지, 이벤트, 장소 행동을 현재 상태 기준으로 고르는 해석기다.
- `story-flow.ts`
  현재 씬과 장소 행동을 합쳐 지금 화면에 보여줄 선택지를 만드는 계층이다.
- `state-utils.ts`
  조건 판정, 효과 적용, 로그 유틸이 모여 있다.
- `repository.ts`
  파일 저장소 구현과 세이브 정규화 로직이 있다.
- `postgres-repository.ts`
  Postgres 저장소 구현이다.
- `content-generator.ts`
  카드 생성기. 템플릿 기반 생성기와 원격 LLM 생성기를 모두 포함한다.
- `base-data.ts`
  시간 상수, 기본 스킬, `baseItems/basePeople/baseLocations` 재수출, 퀘스트/스킬 헬퍼를 둔다.
- `quest-definitions.ts`
  퀘스트 정의만 가진다.

### `src/game/data`

- `locations.ts`
  `src/game/data/regions/*`를 모아 `baseLocations`와 `actionDefinitions`를 다시 내보내는 집계 파일이다.
- `choices.ts`
  `src/game/data/regions/*`의 선택지를 다시 내보내는 집계 파일이다.
- `scenes.ts`
  `src/game/data/regions/*`의 씬과 `SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS`를 다시 내보내는 집계 파일이다.
- `events.ts`
  `src/game/data/regions/*`의 이벤트를 다시 내보내는 집계 파일이다.
- `location-interaction-helpers.ts`
  `interactionFor()`로 장소 액션 객체를 만들 때 기본값을 채워 준다.
- `regions/`
  실제 지역 콘텐츠 작성 폴더다. 지역별 `location.ts`, `choices.ts`, `scenes.ts`, `events.ts`와 지역 `index.ts`가 들어 있다.
- `items.ts`
  아이템 정의가 있다.
- `people.ts`
  인물 정의가 있다.
- `registry.ts`
  위 데이터를 `worldRegistry`로 묶고 정적 검증을 수행한다.
- `story-templates.ts`
  파일은 존재하지만, 현재 `src/game/**/*.ts` 기준 참조되는 곳이 없다.

### `src/game/schemas`

- `game-state.ts`
  런타임 상태인 `GameState` 스키마.
- `session.ts`
  서버 응답과 세이브 구조인 `StateSnapshot`, `GameSession`, 카드 스키마.
- `action.ts`
  `GameAction`, `ActionDefinition` 스키마.
- `choice.ts`, `scene.ts`, `event.ts`, `location.ts`, `item.ts`, `person.ts`, `quest.ts`
  콘텐츠 객체 스키마.
- `condition-effect.ts`
  조건과 효과 타입 정의.
- `index.ts`
  스키마 재수출.

## 3. 핵심 파일별 실제 책임

### `src/server.ts`

- 앱 시작 시 `validateContent()`를 한 번 실행한다.
- `DATABASE_URL` 유무에 따라 `PostgresGameRepository` 또는 `FileGameRepository`를 선택한다.
- `GameService` 인스턴스를 만들고 API를 연결한다.

현재 제공하는 주요 API는 아래와 같다.

- `POST /api/games`
- `GET /api/games/:gameId/state`
- `GET /api/games/:gameId/map`
- `GET /api/games/:gameId/inventory`
- `POST /api/games/:gameId/actions`

### `src/game/service.ts`

`GameService`는 상태 자체를 바꾸는 규칙 파일은 아니고, 세션 단위 흐름을 묶는다.

주요 메서드:

- `createGame()`
  새 세션을 만들고 초기 카드를 채운 뒤 첫 스냅샷을 반환한다.
- `getState()`
  세션을 로드하고 `syncClock()`, `syncQuestState()`, `syncScene()`를 적용한 뒤 스냅샷을 반환한다.
- `performAction()`
  세션을 로드하고 `rules.performAction()`을 실행한 뒤 최신 이벤트 카드와 스냅샷을 만든다.
- `getMap()`
  시간과 씬만 동기화해서 지도 응답을 만든다.
- `getInventory()`
  시간과 씬만 동기화해서 인벤토리 응답을 만든다.

내부 책임:

- `ensureLocationCard()`, `ensurePersonCard()`, `ensureItemCard()`, `ensureEventCardById()`
  카드 캐시를 보장한다.
- `buildAuthoringSceneCard()`
  현재는 씬 카드를 `content-generator.ts`에 맡기지 않고 서비스 내부에서 직접 조립한다.
- `presentedChoices()`
  `resolveStoryFrame()` 결과에 다음 씬 미리보기를 붙인다.
- `buildSnapshot()`
  최종 `StateSnapshot`을 만든다.

### `src/game/content-engine.ts`

현재 상태에서 어떤 콘텐츠가 유효한지 판단하는 해석기다.

주요 함수:

- `resolveSceneDefinition()`
  현재 `state.sceneId`를 유지할 수 있으면 유지하고, 아니면 다음 유효 씬을 찾는다.
- `resolveNextSceneDefinition()`
  위치와 조건을 기준으로 다음 유효 씬을 찾는다.
- `resolveAvailableActions()`
  현재 장소의 `interactionChoices` 중 화면에 보여줄 액션만 고른다.
- `resolveSceneChoices()`
  현재 씬의 `choiceIds`를 실제 `ChoiceDefinition[]`으로 바꾼다.
- `resolveTriggeredEvents()`
  현재 상태에서 발동 가능한 이벤트를 찾는다.
- `resolveEventChoices()`
  이벤트에 연결된 선택지를 읽는다.
- `actionConditionsMet()`, `canPresentAction()`
  액션 노출 조건 판정 헬퍼다.

### `src/game/story-flow.ts`

화면에 보여줄 선택지를 최종 병합하는 계층이다.

주요 함수:

- `resolveStoryFrame()`
  현재 씬 선택지와 현재 장소 행동을 합친 `StoryFrame`을 만든다.
- `buildActionCatalogFromStoryChoices()`
  `StoryChoice[]`를 클라이언트용 `availableActions`로 바꾼다.

중요한 점:

- 씬이 `SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS`에 포함되면 장소 행동은 숨긴다.
- 그렇지 않으면 장소 행동과 씬 선택지를 함께 보여준다.

### `src/game/rules.ts`

`GameState`를 바꾸는 실제 실행기다.

주요 함수:

- `createInitialGameState()`
  새 게임의 기본 상태를 만든다.
- `syncClock()`
  실시간 경과를 게임 시간에 반영한다.
- `syncQuestState()`
  퀘스트 상태를 갱신한다.
- `syncScene()`
  현재 상태에 맞는 `sceneId`와 `activeEventId`를 다시 맞춘다.
- `performAction()`
  실제 액션 실행 진입점이다.
- `applySystemNote()`
  이전 상태와 현재 상태 차이로 시스템 노트를 만든다.

실행 경로:

- `content_action`은 `executeActionDefinition()`으로 간다.
- `content_choice`는 `executeChoiceDefinition()`으로 간다.
- `travel`, `use_item`도 여기서 직접 처리한다.

현재 남아 있는 레거시 경로:

- `GameActionSchema`와 `performAction()`에는 아직 `rest`, `cook`, `buy_meal`, `generate_event` 케이스가 남아 있다.
- 같은 파일 안에 `runActionDefinition()`과 `runChoiceDefinition()`도 남아 있다.
- 현재 화면에서 생성되는 액션은 주로 `content_action` / `content_choice` 경로를 쓰지만, 레거시 케이스는 아직 제거되지 않았다.

### `src/game/state-utils.ts`

공통 판정/효과 처리 유틸이다.

주요 역할:

- `evaluateCondition()`
- `applyEffect()`
- `appendLogEntry()`
- `formatLogTimestamp()`
- 퀘스트 목표 판정 보조

### `src/game/repository.ts`

파일 저장소와 세이브 정규화가 같이 들어 있다.

주요 역할:

- `.runtime/games/*.json` 저장/로드
- `.runtime/templates.json` 저장/로드
- 액션 로그와 생성 로그 append
- 예전 세이브를 현재 스키마로 정규화

정규화 시 실제로 다루는 것:

- 잘못된 location/scene/item/quest/stock 상태 정리
- 로그 메시지 번역
- world 카드 payload 보존

### `src/game/content-generator.ts`

카드 생성 전용 계층이다.

- `TemplateContentGenerator`
  코드에 정의된 기본 데이터만으로 카드 JSON을 만든다.
- `RemoteContentGenerator`
  `LLM_API_URL`과 `LLM_API_KEY`가 있으면 원격 모델을 호출한다.
- `createContentGenerator()`
  환경 변수에 따라 둘 중 하나를 선택한다.

현재 사용 방식:

- 장소/인물/아이템/주인공 카드 생성에 사용된다.
- 이벤트 카드 생성에도 사용된다.
- 씬 카드는 현재 `GameService.buildAuthoringSceneCard()`에서 직접 만든다.

## 4. 현재 데이터의 단일 소스

현재 코드에서 실제 단일 소스는 아래와 같다.

- 장소별 행동
  `src/game/data/regions/<지역>/location.ts`의 `interactionChoices`
- 장면 전용 선택지
  `src/game/data/regions/<지역>/choices.ts`
- 씬 정의
  `src/game/data/regions/<지역>/scenes.ts`
- 이벤트 정의
  `src/game/data/regions/<지역>/events.ts`
- 퀘스트 정의
  `src/game/quest-definitions.ts`
- 전체 참조용 레지스트리
  `src/game/data/registry.ts`의 `worldRegistry`

`src/game/data/locations.ts`, `src/game/data/choices.ts`, `src/game/data/scenes.ts`, `src/game/data/events.ts`는 이제 작성용 원본이 아니라 집계 레이어다.
실제 지역 콘텐츠는 `src/game/data/regions/` 아래에 있고, 집계 파일이 이를 평탄화해 `registry.ts`로 넘긴다.

## 5. 현재 액션 모델

### 클라이언트가 보내는 액션 타입

`src/game/schemas/action.ts`의 `GameActionSchema`는 현재 아래 타입을 받는다.

- `travel`
- `use_item`
- `content_action`
- `content_choice`
- `rest`
- `cook`
- `buy_meal`
- `generate_event`

즉, API 기준으로는 아직 레거시 액션 타입도 살아 있다.

### 데이터로 정의되는 장소 행동

장소 행동 객체는 `ActionDefinition`이고, 현재 주요 필드는 아래다.

- `id`
- `label`
- `type`
- `visibility`
- `presentationMode`
- `locationIds`
- `conditions`
- `effects`
- `failureEffects`
- `failureNote`
- `nextEventId`
- `nextSceneId`

현재 장소 행동 노출은 `presentationMode`와 `conditions`를 같이 본다.

- `when_conditions_met`
  조건을 만족할 때만 화면에 보인다.
- `always`
  화면에는 보이고, 실행 시 실패 분기와 `failureNote`를 탈 수 있다.

## 6. 현재 흐름 계산이 실제로 분산된 위치

흐름 계산은 한 파일에 몰려 있지 않다.

- 씬 선택
  `src/game/content-engine.ts`
  `resolveSceneDefinition()`, `resolveNextSceneDefinition()`
- 화면용 선택지 병합
  `src/game/story-flow.ts`
  `resolveStoryFrame()`
- 다음 씬 미리보기
  `src/game/service.ts`
  `previewNextSceneId()`, `presentedChoices()`
- 실행 후 씬/퀘스트 재동기화
  `src/game/rules.ts`
  `performAction()`, `syncScene()`, `syncQuestState()`

즉, 현재 구조에서 흐름 계산은 `content-engine.ts`, `story-flow.ts`, `service.ts`, `rules.ts`에 나뉘어 있다.

## 7. 지금 코드 기준으로 수정할 위치

- 장소에서 할 수 있는 행동을 바꿀 때
  `src/game/data/regions/<지역>/location.ts`
- 씬 전용 선택지를 바꿀 때
  `src/game/data/regions/<지역>/choices.ts`
- 어떤 씬을 보여줄지 조건을 바꿀 때
  `src/game/data/regions/<지역>/scenes.ts`와 `src/game/content-engine.ts`
- 장소 행동과 씬 선택지를 어떤 기준으로 합칠지 바꿀 때
  `src/game/story-flow.ts`
- 행동 결과로 상태가 어떻게 바뀌는지 바꿀 때
  `src/game/rules.ts`와 `src/game/state-utils.ts`
- API 응답 모양을 바꿀 때
  `src/game/schemas/session.ts`와 `src/game/service.ts`
- 세이브 정규화나 저장 방식을 바꿀 때
  `src/game/repository.ts` 또는 `src/game/postgres-repository.ts`

## 8. 현재 구조 문서에서 의도적으로 적지 않은 것

이 문서는 현재 구조 문서다.
아래 내용은 일부러 넣지 않았다.

- 미래 리팩터링 계획
- 아직 제거되지 않은 코드를 “이미 정리된 것처럼” 설명하는 표현
- 파일에 없는 책임을 단정하는 설명
