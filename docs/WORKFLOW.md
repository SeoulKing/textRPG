# 작업 요청과 프로젝트 구조

사용자 요청을 해당 게임과 원본 파일에 연결하고, 구현·확인·인계까지 이어가는 작업 기준입니다. 작업마다 요청 범위와 완료 증거를 먼저 정하고 아래 표에서 필요한 진입점만 따라갑니다.

## 요청부터 완료까지

1. **요청 고정**: 대상 게임·원하는 변화·이번 완료 범위를 한 문장으로 정합니다. 예: “Godot 여관의 출입 위치를 수정하고 원본 장면에 반영합니다.”
2. **범위 확인**: `git status --short`로 진행 중인 변경을 확인하고, 아래 진입점에서 실제 호출·참조를 따라 대상 파일을 좁힙니다.
3. **필요한 기준 읽기**: `AGENTS.md`와 `.agents/LESSONS.md`의 공통 항목을 적용하고, 해당 주제 메모와 역할·가이드의 관련 부분만 읽습니다. 이미 읽은 같은 지침을 다시 열지 않습니다.
4. **제작과 수정**: 원본을 수정합니다. 새 아르카나 미술은 컨셉 한 장 → 사용자 승인 → 제작·연결을 따르며, 단순 오류 수정과 이미 승인된 범위에는 승인을 반복하지 않습니다.
5. **범위에 맞는 확인**: 문서·참조·변경 내용을 우선 확인합니다. 테스트·브라우저는 사용자 요청 시 실행하며, 빌드·내보내기는 요청한 산출물에 필요한 경우 수행합니다.
6. **인계**: 변경 결과, 수정 파일, 실제 확인과 미확인, 사용자가 직접 확인할 행동·기대 결과를 짧게 전달합니다. 커밋·푸시·배포는 요청 범위에 있을 때 이어갑니다.

‘소스 수정’, ‘웹 산출물 생성’, ‘로컬 서버 제공’, ‘공개 배포’는 서로 다른 완료 단계입니다. 사용자가 게임 반영을 요청했다면 필요한 단계까지 이어가되, 빌드 성공만으로 브라우저 표시나 공개 배포까지 확인했다고 보고하지 않습니다.

## 프로젝트 구조와 작업 진입점

| 대상 | 먼저 확인할 원본과 진입점 | 필요한 기준 |
| --- | --- | --- |
| 텍스트 게임 화면과 입력 | `index.html`, `app-api.js`, `styles.css`, 참조되는 `client/` 모듈 | UI 요청이면 [게임 개발 원칙](../GAME_DEVELOPMENT_PRINCIPLES.md), 글을 바꾸면 [서사 기준](../NARRATIVE_GUIDE.md) |
| 서버 API와 저장 | `src/server.ts` → `src/game/service.ts` → 해당 규칙·저장소, `src/game/schemas/` | [실행 환경 메모](../.agents/lessons/runtime.md), 관련 게임 규칙 |
| 지역·아이템·선택지 | `src/game/data/registry.ts`, `src/game/data/regions/<regionId>/`, `src/game/data/items.ts` | [데이터 작성법](../src/game/data/README.md), [게임 규칙 메모](../.agents/lessons/gameplay.md) |
| 콘텐츠 스튜디오 | `content-editor.html`, `content-editor.js`, `content-writer*.js`, `src/game/content-studio*.ts`, `content/content-studio.json` | [Studio 안내](../CONTENT_STUDIO.md), 실행 환경 메모의 실제 게시 데이터·버전 주의점 |
| 상태 기반 월드 | `src/state-world-routes.ts`, `src/game/state-world/` | [상태 월드 설계](state-world-engine.md) |
| 서사·NPC·탐색 생성 | 해당 `src/game/` 모듈과 호출부, 해당 지역 데이터 | [서사 기준](../NARRATIVE_GUIDE.md), 게임 규칙 메모에서 관련 항목 |
| Godot 시작·통신·저장 | `godot-arcana/project.godot` → `main.tscn` → `scripts/main.gd` | [Godot 개발 스킬](../skills/godot-arcana-development/SKILL.md) |
| Godot 배치·이동·UI·전투 | `godot-arcana/scenes/`, `scripts/world.gd`, `scripts/game_ui.gd`, `scripts/arcana_spatial.gd`의 관련 호출부 | Godot 개발 스킬의 해당 행; 판정은 연결된 `src/game/`도 확인 |
| 그래픽·캐릭터·애니메이션 | [그래픽 담당](../GRAPHICS_AGENT.md) → 해당 미술 가이드 → 실제 활성 자산의 원본·표시기 | [그래픽 메모](../.agents/lessons/graphics.md), 동작 작업이면 [캐릭터 파이프라인](../godot-arcana/art/CHARACTER_ANIMATION_PIPELINE.md) |
| 건물·새 지역 제작 | [맵 제작 담당](../MAP_AGENT.md), `art-studies/regions/<region-id>/brief.md` | [맵 제작 스킬](../skills/arcana-map-builder/SKILL.md), 해당 지역의 승인 범위 |
| Godot 웹 내보내기 | `godot-arcana/export_presets.cfg`, `scripts/build-godot-arcana.ps1` → `godot-web/` | Godot 개발 스킬, 실행 환경 메모의 엔진 웹 빌드 항목 |
| Unity 프로토타입 | `unity-mvp/Assets/`, `scripts/build-unity-preview.ps1` → `assets/unity-preview/` | [Unity 안내](../unity-mvp/README.md) |
| 서버 실행·호스팅 | `package.json`, `render.yaml`, `.github/workflows/deploy-pages.yml` | 실행 환경 메모, [실행 안내](../README.md) |

표의 경로는 진입점입니다. 존재하는 파일과 실제 참조를 확인한 뒤 수정하며, 이름을 추측해 여러 후보 파일을 연속으로 열지 않습니다.

## 원본과 산출물의 경계

```text
텍스트 화면 / Content Studio ─┐
Godot 클라이언트 ─────────────┼→ Node/Fastify API → 게임 규칙·응답 스키마 → 파일 또는 PostgreSQL 저장
상태 기반 월드 ───────────────┘
Unity 프로토타입 → 별도 WebGL 미리보기
```

- **미술 원본**: `art-studies/`, `godot-arcana/art/source/`와 대상별 README가 가리키는 편집 파일입니다. 실제 활성 연결을 확인하여 사용하며, 가장 큰 버전 번호나 문서 끝의 ‘최신’ 제목만으로 선택하지 않습니다.
- **게임 소스**: `src/`, 루트 웹 파일·`client/`, `godot-arcana/`, `unity-mvp/Assets/`입니다. 게임 규칙의 서버 판정과 클라이언트 표시 책임을 구별합니다.
- **생성 산출물**: `.server-dist/`, `godot-web/`, `assets/unity-preview/`, `assets/optimized/`입니다. 산출물만 직접 고쳐 다음 빌드에서 수정이 사라지는 상황을 피합니다.
- **실행·캐시**: `.runtime/`, `.tmp-*/`, `node_modules/`, `godot-arcana/.godot/`, Unity의 `Library/`·`Temp/`·`Logs/`입니다. 일반 소스 탐색에서 제외하고 해당 실행 문제에만 확인합니다.
- **기밀 설정**: `.env`, `.env.local`은 설정 작업에 필요한 키 이름과 존재 여부만 확인하며 값을 출력하거나 문서에 복사하지 않습니다.

게시된 Studio 데이터는 로컬 JSON seed와 다를 수 있고 기존 저장은 콘텐츠 버전을 유지할 수 있습니다. 콘텐츠 변경 때 실제 레지스트리·기존 저장 적용 경계를 함께 판단합니다.

성능 개선과 작업 시간의 균형은 [공통 작업 기준](../AGENTS.md#성능과-작업-속도의-균형)을 따릅니다. 작은 작업에는 별도 분석 절차를 추가하지 않습니다.

## 확인과 완료 기준

| 변경 | 기본 확인 | 실행 확인을 요청받았을 때 |
| --- | --- | --- |
| 문서·지침 | diff, 경로와 링크, 중복·모순 | 코드 테스트·게임 실행 불필요 |
| 독립 JavaScript | 변경 부분과 참조 확인, 필요한 구문 검사 | 관련 동작만 확인 |
| TypeScript 규칙 | 호출부·입출력·상태 변화 확인 | 관련 테스트 우선, 타입 경계 변경 시 typecheck 추가 |
| 콘텐츠 | 정의·참조·기존 저장 적용 범위 확인 | `content:validate` 우선 |
| 화면·상호작용 | 변경과 연결된 DOM·스타일·입력 경로 확인 | 사용자 요청 시 한 브라우저 세션에서 핵심 경로 확인 |
| 웹 산출물·컴파일 경계 | 원본과 생성 경로 확인 | 요청된 산출물을 빌드하고 결과 파일·오류 확인 |
| 미술 | 승인 기준·규격·활성 연결 비교 | 요청 범위의 렌더·게임 화면 확인, 확인 종류를 구별 |

`npm run build`는 TypeScript 컴파일 외에 이미지 최적화와 런타임 산출물 생성도 실행합니다. 단순 로직 확인을 위해 전체 빌드를 선택하지 않습니다. `test:state-world`와 `test:studio`는 현재 빌드를 포함하므로 비용을 고려합니다. 실제 명령과 런타임 경로는 `package.json`과 실행 환경 메모에서 확인합니다.

같은 `도구/명령 + 대상 + 핵심 오류`는 전제가 바뀌기 전에는 반복하지 않습니다. 실패 뒤에는 원인과 대체 경로를 판단하고, 성공 가능성을 바꾸는 변화가 있을 때 한 번 재시도합니다.

## 문서 유지와 후속 최적화

- 작업 규칙·검증 선택은 `AGENTS.md`, 작업 진입점은 이 문서, 반복되는 사용자 선호·실패와 대체 경로는 주제별 학습 메모에서 관리합니다.
- 미술 규격은 대상 가이드, 승인·원본·배치·연결 상태는 대상 또는 지역 명세에서 관리합니다. 작업 일지는 학습 메모에 복사하지 않습니다.
- 그래픽 문서에 남은 Blender·스프라이트의 과거 ‘최신’ 항목은 실제 연결과 대조하며 읽습니다. 후속 정리는 활성 상태 요약과 이력 분리를 우선하되, 승인 디자인과 수동 원본을 보존합니다.
- 배포 설정상 GitHub Pages는 `master`의 정적 파일을, Render는 `codex/region-content-structure` 브랜치의 Node 서비스를 대상으로 합니다. 실제 원격 설정과 배포 상태는 게시 요청 시 확인합니다.
- `src/game/service.ts`와 `app-api.js`의 추가 분리는 해당 기능 변경 때 호출 경계를 따라 진행합니다. 구조 정리만을 위해 여러 게임의 코드를 한꺼번에 이동하지 않습니다.
