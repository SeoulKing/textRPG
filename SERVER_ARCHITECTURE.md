# LLM Game Server Architecture

## 목표

현재 구조의 핵심은 서버 권한형 게임 진행이다.

- 브라우저는 상태를 직접 소유하지 않는다.
- 규칙 엔진과 저장은 서버가 담당한다.
- LLM은 카드와 장면을 구조화된 JSON으로만 만든다.
- 생성 결과는 세션 월드와 템플릿 저장소에 남는다.

## 실행 경계

### 브라우저

- `app-api.js`
- 서버에서 받은 `StateSnapshot`만 렌더링
- `gameId`만 `localStorage`에 보관
- 액션은 `POST /api/games/:gameId/actions`로 제출

### 서버

- `src/server.ts`
- Fastify 부트스트랩
- 정적 에셋과 API 제공
- 환경 변수에 따라 Postgres 또는 파일 저장소 선택

### 게임 계층

- `src/game/base-data.ts`
  - 기본 장소, 아이템, 인물, 퀘스트, 스킬 정의
- `src/game/rules.ts`
  - 시간 진행, 허기 감소, 이동, 휴식, 아이템 사용
- `src/game/content-generator.ts`
  - 템플릿 생성기와 OpenAI 호환 원격 생성기
- `src/game/service.ts`
  - 카드 보장, 스냅샷 생성, 액션 로그 기록

## 카드와 스냅샷

### 주요 카드

- `LocationCard`
- `PersonCard`
- `ItemCard`
- `ProtagonistCard`
- `SceneCard`
- `EventCard`

### 이야기 재료

LLM 입력 재료는 `StoryMaterials`로 묶인다.

- `locations`
- `people`
- `items`
- `protagonist`

여기에 최근 로그와 현재 퀘스트 상태도 함께 전달한다.

### 클라이언트 스냅샷

`GET /api/games/:gameId/state` 응답에는 아래가 포함된다.

- `state`
- `currentScene`
- `visibleLocations`
- `visiblePeople`
- `inventoryCards`
- `protagonist`
- `storyMaterials`
- `availableActions`
- `mapEntries`
- `quests`
- `skills`
- `latestEvent`

`availableActions`는 버튼 렌더링용 구조화된 선택지다.  
`mapEntries`는 현재 위치 기준 이동 가능 여부와 잠금 이유를 담는다.

## 저장소 구조

### Postgres 모드

`DATABASE_URL`이 설정되면 `PostgresGameRepository`를 사용한다.

테이블은 아래 다섯 개다.

- `game_sessions`
- `world_instances`
- `content_templates`
- `action_logs`
- `generation_logs`

테이블 생성 SQL은 `src/db/schema.sql`에 있고, `npm run db:init`으로 초기화할 수 있다.

### 파일 fallback 모드

`DATABASE_URL`이 없으면 기존 파일 저장소를 유지한다.

- `.runtime/games/*.json`
- `.runtime/templates.json`
- `.runtime/action-log.jsonl`
- `.runtime/generation-log.jsonl`

## LLM 파이프라인

현재 생성 흐름은 아래와 같다.

1. `GameService`가 현재 세션 상태를 읽는다.
2. 가시 장소/인물/아이템/주인공을 모아 `StoryMaterials`를 만든다.
3. 최근 로그와 퀘스트 상태를 함께 `RemoteContentGenerator`에 전달한다.
4. 원격 LLM 또는 fallback 생성기가 카드 JSON을 만든다.
5. Zod 스키마로 검증한다.
6. 유효한 결과만 세션 월드와 템플릿 저장소에 기록한다.

이 구조 덕분에 같은 세션에서는 이미 생성된 카드를 재사용할 수 있다.

## API

- `GET /api/health`
- `POST /api/games`
- `GET /api/games/:gameId/state`
- `POST /api/games/:gameId/actions`
- `GET /api/games/:gameId/map`
- `GET /api/games/:gameId/inventory`

## 배포 기준

- 서버: Railway
- 데이터베이스: Supabase Postgres
- LLM: OpenAI 호환 API

자세한 배포 절차와 준비물은 `DEPLOY.md`에 정리한다.
