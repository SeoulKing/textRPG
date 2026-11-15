# 아르카나 · 별빛의 도시

Godot 2D 월드와 서버 판정 기반의 아르카나 프로젝트입니다. 현재 주인공은 **하이브리드 버전 1**로 확정했으며, 캐릭터 제작실과 본편을 같은 Godot 프로젝트에서 관리합니다.

## 작업 진입점

- 게임 원본: `godot-arcana/project.godot` → `main.tscn` → `scripts/main.gd`
- 캐릭터 원본·작업실: [캐릭터 아트 담당](docs/roles/CHARACTER_ART.md), `godot-arcana/scenes/characters/hybrid-v1/`
- 지역별 가구·사물: [월드 제작 담당](docs/roles/WORLD_BUILDING.md), `godot-arcana/scenes/props/<region>/<category>/`
- 서버: `src/server.ts`, 공용 세계·계정·전투는 `src/online/`
- 게임 규칙·저장·콘텐츠: `src/game/`
- 웹 내보내기 산출물: `godot-web/`
- 상세 제작·빌드 경로: [작업 흐름](docs/WORKFLOW.md)

## 역할별 제작 기준

[개발](docs/roles/DEVELOPMENT.md) · [캐릭터 아트](docs/roles/CHARACTER_ART.md) · [월드 제작·배치](docs/roles/WORLD_BUILDING.md) · [서사](docs/roles/NARRATIVE.md)

규칙은 역할 문서에서 관리하고, 원본·승인·파츠 등록은 대상 자산의 README/JSON에서 관리합니다. 이전 가이드 경로는 연결문이며 [보존 기록](docs/archive/ART_HISTORY.md)을 현행 규칙으로 사용하지 않습니다.

## 로컬 실행

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

기존 `.env`·`.env.local`은 유지합니다. 기본 포트는 3000입니다. [아르카나](http://localhost:3000/godot/) · [계정](http://localhost:3000/account.html). `/`와 `/index.html`은 `/godot/`으로 이동합니다.

```powershell
npm run build:server  # 서버 컴파일
npm run build        # 서버 컴파일 + 기존 Godot 웹 출력의 배포 패키징
npm start
```

`npm run build`는 Godot 원본을 내보내지 않습니다. Godot 변경은 기존 `scripts/build-godot-arcana.ps1` 또는 해당 작업의 내보내기 경로를 따릅니다. Render 서비스·데이터베이스 식별자는 기존 설정을 유지합니다.

## 폐허 서울 분리

과거 텍스트 RPG·콘텐츠 스튜디오·상태 기반 월드는 별도 프로젝트 [seoul-survival](../seoul-survival/README.md)로 분리했습니다. 그 프로젝트의 기본 포트는 3001입니다.

화면·이미지·편집기·전용 테스트와 서버 경로는 현재 프로젝트에서 제거했습니다. 아르카나가 사용하는 게임 엔진·스키마·아이템 정의·저장·콘텐츠 레지스트리는 현재 프로젝트에도 보존했습니다. 각 프로젝트는 자기 코드를 소유하며 서로의 폴더나 `node_modules`에 의존하지 않습니다. 공용 엔진 내부에는 기존 텍스트 게임과의 호환 코드가 남아 있습니다.

기존 `.env`·`.env.local`·로컬 저장·공개 데이터베이스는 이동하지 않았습니다. 테스트와 브라우저 확인은 사용자 요청 시 수행합니다.
