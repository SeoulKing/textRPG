# 프로젝트 구조

이 문서는 현재 코드에 실제로 존재하는 구조만 설명합니다. 설계 아이디어가 아니라, 지금 서버와 클라이언트가 어떤 파일을 통해 게임을 굴리는지에 대한 기준 문서입니다.

## 0. 현재 게임 방향

현재 기본 플레이는 LLM이 즉석에서 세상을 주도하는 장편 확장이 아니라, 손으로 설계한 10일 생존 MVP입니다.

- 목표: 10일차 구조 판정 전까지 생존하고 구조 신호를 완성합니다.
- 구조 신호: 무전기 배터리, 무전기 안테나, 무전기 송신기와 제작 재료를 모아 임시 거처에서 조립합니다.
- 지역: 임시 거처, 편의점 폐허, 급식소, 병원, 지하철역, 검문소를 고정 seed region으로 둡니다.
- 자유도: 지역 자체를 날짜나 플래그로 잠그지 않고, 일차별 사건과 퀘스트/기록으로 다음 목표를 안내합니다.
- LLM: `ENABLE_LLM_WORLD_PLANNER=true`를 명시하지 않는 한 월드 플래너는 템플릿 기반으로 동작합니다.

## 1. 서사 생성 흐름

LLM 동적 확장은 `프런티어 선택 -> 서사 초안 -> 서버 컴파일 -> 동적 월드 저장` 순서로 동작합니다.

```text
플레이어가 frontier 선택 실행
  -> GameService.expandFrontier()
  -> WorldPlanner.generateAnchorDraft()
  -> NarrativeCompiler
  -> DynamicWorldRegistry patch 저장
  -> 새 location으로 이동
```

같은 동적 지역 안에서 탐색/대화 선택지를 누르면 새 맵 지역을 만들지 않고 현재 location 안에 새 scene을 누적합니다.

```text
플레이어가 continuation 선택 실행
  -> GameService.performNarrativeContinuation()
  -> WorldPlanner.generateSceneDraft()
  -> NarrativeCompiler
  -> DynamicWorldRegistry scene/choice patch 저장
  -> 현재 location의 새 scene 표시
```

주요 파일:

- `src/game/world-planner.ts`: planner factory와 공개 인터페이스 재수출만 담당합니다.
- `src/game/gemini-world-planner.ts`: Gemini API로 `NarrativeAnchorDraft`와 `NarrativeSceneDraft`를 생성합니다.
- `src/game/template-world-planner.ts`: Gemini 실패 또는 미설정 시 사용할 안전한 템플릿 초안을 만듭니다.
- `src/game/narrative-planner-fallback.ts`: fallback draft와 내일 world plan 템플릿을 정의합니다.
- `src/game/narrative-planner-validation.ts`: draft/compiled result guardrail을 검증합니다.
- `src/game/narrative-compiler.ts`: LLM 초안을 기존 게임 스키마의 location, scene, choice, effect로 컴파일합니다.
- `src/game/narrative-expansion-service.ts`: compiler trace 기록과 compiled result 검증을 묶습니다.

LLM은 저수준 `effect`나 `condition`을 직접 만들지 않습니다. LLM은 장면, 설명, 인물 힌트, 선택지 의도만 만들고, 서버가 이를 안전한 게임 데이터로 바꿉니다.

현재 LLM draft는 단순 장소/선택지뿐 아니라 `prose`, `tone`, `tension`, `dramaticQuestion`, `worldFacts`, `unresolvedQuestions`, `directorNotes`를 포함할 수 있습니다. 서버는 `prose`를 실제 장면 본문으로 우선 사용하고, `worldFacts`와 `unresolvedQuestions`는 `NarrativeAnchorMemory`에 저장해 다음 continuation prompt로 이어 줍니다.

## 2. 정적 콘텐츠 흐름

시작 구역과 손제작 콘텐츠는 `src/game/data/regions/` 아래에 지역별로 나뉩니다.

```text
src/game/data/regions/<region>/
  -> index.ts
  -> location.ts
  -> scenes.ts
  -> choices.ts  (scene choice가 있을 때만)
  -> events.ts   (event가 있을 때만)
```

각 지역의 `index.ts`는 `defineRegion()`으로 묶습니다. `location.ts`는 `defineLocation()`, `interactionFor()`, `stockNode()`를 사용해 빈 기본값과 반복 보일러플레이트를 줄입니다. `choices`와 `events`는 선택 필드라서 빈 파일을 만들 필요가 없습니다. 데이터 작성 진입점은 `src/game/data/README.md`, 지역 작성 방법은 `src/game/data/regions/README.md`에 정리되어 있습니다.

집계 파일:

- `src/game/data/locations.ts`: 지역 정의와 location interaction 집계
- `src/game/data/choices.ts`: 선택지 정의 집계
- `src/game/data/scenes.ts`: scene 정의 집계
- `src/game/data/events.ts`: event 정의 집계
- `src/game/data/registry.ts`: 정적 registry 조립과 content validation

정적 콘텐츠는 서버 시작 시 seed registry로 취급됩니다. 동적 콘텐츠는 세이브의 `state.dynamicContent`에 저장되고, 런타임에서는 `seed registry + dynamic registry`를 합쳐 해석합니다.

## 3. 상태 변경 흐름

클라이언트가 보낼 수 있는 액션은 네 종류입니다.

- `travel`: 이미 열린 지역으로 이동합니다.
- `use_item`: 인벤토리 아이템을 사용합니다.
- `content_action`: location interaction을 실행합니다.
- `content_choice`: 현재 scene choice를 실행합니다.

주요 처리 파일:

- `src/server.ts`: API 요청을 받고 `{ action: ... }` 구형 wrapper도 호환 처리합니다.
- `src/game/service.ts`: 세션 로드, 액션 라우팅, LLM 생성 흐름 호출, snapshot 조립을 담당합니다.
- `src/game/rules.ts`: 실제 `GameState` 변경을 수행합니다.
- `src/game/state-utils.ts`: 조건 판정과 effect 적용을 담당합니다.
- `src/game/runtime-registry.ts`: 정적 registry와 동적 registry를 합칩니다.
- `src/game/repository.ts`: 파일 기반 세이브 저장, 로딩, 정규화를 담당합니다.

프런티어와 continuation은 일반 `rules.performAction()`보다 먼저 `GameService`에서 가로채 처리합니다. 그 외 제작, 파밍, 이동, 아이템 사용은 기존 rules/effect 흐름으로 처리됩니다.

효과 실행 경계:

- `advance_time`, `advance_to_daybreak`: 시간과 생존 압박을 함께 움직이므로 `rules.ts`의 definition 실행 경로에서 처리합니다.
- 그 외 즉시 상태 변경 효과와 `random_outcome`: `state-utils.applyEffect()`에서 처리합니다.
- `applyEffect()`에 시간 효과를 직접 넘기면 오류가 납니다. 새 시간형 효과를 만들 때는 rules 계층에서 하루 전환, 기력 감소, 구조 판정까지 함께 검토해야 합니다.

## 4. 클라이언트 렌더 흐름

클라이언트는 서버에서 받은 `StateSnapshot`만 렌더링합니다.

```text
app-api.js
  -> /api/games
  -> /api/games/:gameId/state
  -> /api/games/:gameId/actions
  -> render()
```

주요 렌더 대상:

- `currentScene`: 현재 장면 제목과 본문
- `availableActions`: 화면에 표시할 선택지 버튼
- `visibleLocations` / `mapEntries`: 지도 표시
- `inventoryCards`: 인벤토리 카드
- `quests`: 퀘스트 패널
- `devLlmTrace`: localhost 개발용 LLM trace 패널

개발용 LLM trace는 `request`, `raw_draft`, `draft_validation`, `compiler_summary`, `compiled_result`, `fallback`, `error` 단계를 구분합니다. 이를 통해 Gemini가 무엇을 냈는지, 서버가 무엇을 컴파일했는지, 왜 fallback으로 갔는지 바로 확인할 수 있습니다.
