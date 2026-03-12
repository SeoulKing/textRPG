# 배포 가이드

## 준비물

배포 전에 아래 값을 준비합니다.

- `Railway` 프로젝트
- `Supabase` 프로젝트
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- 필요 시 `LLM_MODEL`

## 1. Supabase 준비

1. Supabase에서 새 프로젝트를 생성합니다.
2. 프로젝트 생성 후 `Project Settings -> Database`에서 Postgres 연결 문자열을 확인합니다.
3. `Project Settings -> API`에서 `SUPABASE_URL`과 `service_role` 키를 확인합니다.

## 2. 로컬에서 스키마 적용

```powershell
cd D:\BANG\project\textRPG
$env:DATABASE_URL="postgresql://..."
npm install
npm run db:init
```

이 명령은 `src/db/schema.sql`에 정의된 아래 테이블을 생성합니다.

- `game_sessions`
- `world_instances`
- `content_templates`
- `action_logs`
- `generation_logs`

## 3. Railway 배포

1. 이 저장소를 Railway 프로젝트에 연결합니다.
2. Railway 서비스의 환경 변수에 아래 값을 넣습니다.

- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

3. Start Command는 기본적으로 아래 설정이면 충분합니다.

```text
npm run start
```

4. Build 단계에서 필요한 경우 Railway가 자동으로 `npm install`을 수행합니다.

## 4. 배포 후 확인

### 헬스체크

```powershell
Invoke-RestMethod -Uri "https://YOUR-RAILWAY-DOMAIN/api/health"
```

정상 응답 예시는 아래와 같습니다.

```json
{
  "ok": true,
  "service": "llm-game-server"
}
```

### 새 게임 세션 생성

```powershell
Invoke-RestMethod -Uri "https://YOUR-RAILWAY-DOMAIN/api/games" -Method Post -ContentType "application/json" -Body "{}"
```

응답에 `gameId`와 `currentScene`, `availableActions`, `mapEntries`가 오면 정상입니다.

## 5. 운영 중 점검 포인트

- `GET /api/health` 응답 여부
- Railway 로그에서 서버 부팅 실패 여부
- Supabase DB 연결 오류 여부
- LLM API 401, 429, 500 응답 여부
- `content_templates`와 `game_sessions`에 데이터가 실제로 쌓이는지 여부

## 사용자가 나에게 전달해 줄 값

최종 연결을 위해 아래 값을 주면 됩니다.

- `Railway` 프로젝트 접근 권한
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- 필요 시 `LLM_MODEL`
