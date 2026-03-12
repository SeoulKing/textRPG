# 잔불 아래

폐허가 된 서울에서 3일을 버티는 서버 권한형 텍스트 RPG입니다.  
브라우저는 렌더러 역할만 맡고, 게임 상태와 카드 생성, 액션 검증, 기록 저장은 Fastify 서버가 담당합니다.

## 현재 구조

- 브라우저 클라이언트: `app-api.js`
- 서버: `src/server.ts`
- 규칙 엔진: `src/game/rules.ts`
- 카드 생성기: `src/game/content-generator.ts` (LLM 확장 시 `RemoteContentGenerator` 사용)
- 저장소: `src/game/repository.ts`, `src/game/postgres-repository.ts`
- 스키마: `src/game/schemas/`
- **게임 데이터**: `src/game/data/` (items, locations, people, story-templates, registry)

## 로컬 실행

```powershell
cd D:\BANG\project\textRPG
npm install
npm run start
```

브라우저에서 `http://localhost:3000` 으로 접속합니다.

## 환경 변수

`.env.example`을 참고해 아래 값을 설정할 수 있습니다.

- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

`DATABASE_URL`이 있으면 Postgres 저장소를 사용하고, 없으면 로컬 `.runtime` 파일 저장소로 fallback 합니다.  
`LLM_API_URL`과 `LLM_API_KEY`가 있으면 OpenAI 호환 API를 사용하고, 없으면 템플릿 기반 생성기로 동작합니다.

## 데이터베이스 초기화

Supabase Postgres나 일반 Postgres를 쓸 때는 먼저 스키마를 만듭니다.

```powershell
cd D:\BANG\project\textRPG
$env:DATABASE_URL="postgresql://..."
npm run db:init
```

## API 요약

- `POST /api/games`: 새 게임 세션 생성
- `GET /api/games/:gameId/state`: 현재 스냅샷 조회
- `POST /api/games/:gameId/actions`: 이동, 휴식, 아이템 사용, 이벤트 생성
- `GET /api/health`: 헬스체크

상태 스냅샷에는 `currentScene`, `visibleLocations`, `visiblePeople`, `inventoryCards`, `protagonist`, `storyMaterials`, `availableActions`, `mapEntries`가 포함됩니다.

## 배포 문서

- 구조 설명: `SERVER_ARCHITECTURE.md`
- Railway/Supabase 배포 절차: `DEPLOY.md`
