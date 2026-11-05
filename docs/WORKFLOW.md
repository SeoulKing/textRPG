# 작업 흐름과 프로젝트 구조

공통 작업·검증 원칙은 [AGENTS.md](../AGENTS.md)에, 제작 기준은 아래 역할 문서에 한 번만 둡니다. 작업을 시작할 때 대상 게임·원하는 변화·완료 범위를 한 문장으로 정하고 `git status --short`와 실제 호출·참조에서 수정 대상을 좁힙니다.

## 역할별 진입점

| 역할 | 읽을 문서 | 실제 수정의 진입점 |
| --- | --- | --- |
| 개발 | [DEVELOPMENT.md](roles/DEVELOPMENT.md) | `godot-arcana/project.godot` → `main.tscn` → `scripts/main.gd`, `src/server.ts`와 `src/online/` |
| 캐릭터 아트 | [CHARACTER_ART.md](roles/CHARACTER_ART.md) | `godot-arcana/art/characters/hybrid-v1/`, `scripts/characters/hybrid_v1/`, `scenes/characters/hybrid-v1/` |
| 월드 제작·배치 | [WORLD_BUILDING.md](roles/WORLD_BUILDING.md) | `scenes/native_2d/`, `scenes/shop_2d.tscn`, `scenes/props/<region>/<category>/`, `data/prop-library.json` |
| 서사 | [NARRATIVE.md](roles/NARRATIVE.md) | 해당 지역·NPC 콘텐츠와 실제 상태를 전달하는 `src/game/` 호출부 |

표의 코드 경로는 별도 표시가 없으면 `godot-arcana/` 기준입니다. 필요한 역할·기능의 관련 부분만 읽으며 실행·캐시·이력 전체를 기본 탐색에 포함하지 않습니다.

## 요청부터 완료까지

1. 대상·변화·범위와 결과를 입증할 가장 싼 증거를 정합니다.
2. 진행 중인 변경과 실제 활성 연결을 확인하고 원본을 수정합니다.
3. 새 미술은 승인 범위에 따라 제작하며 이미 받은 승인·단순 오류 수정의 승인을 반복하지 않습니다.
4. 수정 내용·참조·필요한 구문을 확인합니다. 게임·테스트·브라우저는 사용자 요청 시에만 실행합니다.
5. 요청 범위의 연결·산출물까지 완료하고 실제 확인·미확인·다음 직접 확인 행동을 짧게 인계합니다.

소스 수정·웹 내보내기·서버 제공·공개 배포는 다른 단계입니다. 파일 생성·구조 검사·시각 검토·사용자 미술 승인·실제 플레이 확인도 구별합니다. 커밋·푸시·배포는 해당 요청이 있을 때 수행합니다.

## 프로젝트 분리

이 폴더는 **아르카나 본편과 그 안의 하이브리드 캐릭터 제작실**을 유지합니다. 과거 독립 캐릭터 프로젝트 대신 본편의 `scenes/characters/hybrid-v1/`에서 작업합니다. 확정 외형의 단일 편집 원본은 `art/characters/hybrid-v1/`입니다.

폐허 서울 텍스트 RPG·콘텐츠 스튜디오·상태 기반 월드는 [별도 프로젝트](../../seoul-survival/README.md)에서 작업합니다. 아르카나가 사용하는 `src/game/` 엔진·스키마·콘텐츠 시드는 현재 프로젝트에 보존하며 다른 프로젝트 폴더를 직접 참조하지 않습니다.

## 원본과 산출물

| 구분 | 경로와 취급 |
| --- | --- |
| 캐릭터 단일 원본 | `godot-arcana/art/characters/hybrid-v1/`: PixelPen·PNG·리그·공통 동작·조립 명세. 수동 원본을 생성기로 덮어쓰지 않습니다. |
| 지역 원본·승인 | `art-studies/regions/<region-id>/brief.md`, 대상 manifest와 `godot-arcana/art/source/`의 실제 연결 원본 |
| 배치 원본 | `godot-arcana/scenes/native_2d/`, `scenes/shop_2d.tscn`: 사용자 Transform·인스턴스 override·ID 보존 |
| 재사용 사물 | `godot-arcana/scenes/props/<region>/<category>/*.tscn`: 그림·접지·충돌을 함께 배치 |
| 게임 코드 | `godot-arcana/`, `src/`, 현재 계정·진입 웹 파일. 서버 판정과 클라이언트 표시 책임을 구별합니다. |
| 생성 산출물 | `.server-dist/`, `godot-web/`, `assets/unity-preview/`: 산출물만 직접 고치지 않습니다. |
| 실행·캐시 | `.runtime/`, `.tmp-*/`, `node_modules/`, Godot `.godot/`, Unity `Library/Temp/Logs/`: 해당 실행 문제에만 확인 |
| 문서 | `docs/roles/` 현행 기준, 기능별 `docs/arcana-*.md` 기술 명세, 대상별 README/JSON 편집 계약, `docs/archive/ART_HISTORY.md` 비활성 이력 |
| 기밀·저장 | `.env`, `.env.local`, 로컬 저장·데이터베이스: 현재 값을 보존하고 비밀 값을 출력하지 않습니다. |

게시 데이터와 로컬 seed, 기존 저장의 콘텐츠 버전은 다를 수 있습니다. 지역·아이템 정의를 바꿀 때 레지스트리·기존 저장 적용 범위를 확인합니다. 예전 문서의 ‘현재/최신’ 제목보다 최신 사용자 지시와 실제 활성 호출을 우선합니다.

## 실행과 인계

로컬 실행·빌드는 [README](../README.md)와 [개발 역할 문서](roles/DEVELOPMENT.md)를 따릅니다. `npm run build`는 서버 컴파일과 기존 Godot 웹 출력 패키징이며 Godot 소스를 내보내지 않습니다. 웹 내보내기는 `scripts/build-godot-arcana.ps1`과 실제 export preset을 확인합니다.

검증 선택·실패 재시도·학습 기록 규칙은 [AGENTS.md](../AGENTS.md)에만 둡니다. 역할 문서에 작업 일지를 계속 덧붙이지 않습니다. 새 수치·승인·활성 연결은 해당 역할 또는 자산의 명세 한곳에서 관리합니다.

## 여러 조직의 자율 제작

목표부터 작업 선정·협업·통합 인수까지 이어갈 때는 [제작 조직 운영](studio/README.md)과 [출시 로드맵·계약 초안](studio/RELEASE_PLAN.md)을 사용합니다. 목표별 승인과 작업 상태는 `studio/board.json`에 기록하며, 세부 제작 규칙은 위 역할 문서를 유지합니다. CLI 진입점은 `node scripts/studio/studio.mjs status`입니다.