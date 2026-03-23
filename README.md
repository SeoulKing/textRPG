# textRPG

서버 권한으로 진행되는 선택형 생존 TRPG 프로토타입이다.
클라이언트는 `StateSnapshot`을 렌더링하고, 실제 장면 진행과 조건 판정은 서버 엔진이 담당한다.

## 실행

```powershell
cd D:\BANG\project\textRPG
npm install
npm run start
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 연다.

## 환경 변수

`.env.example` 참고.

- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

`DATABASE_URL`이 없으면 `.runtime` 파일 저장소를 사용한다.
`LLM_API_URL`과 `LLM_API_KEY`가 없으면 템플릿 기반 생성기로 동작한다.

## 문서

- 현재 구조 기준 문서: `OBJECT_MODEL.md`
