---
name: godot-arcana-development
description: Develop and troubleshoot this repository's Godot Arcana client using its Godot 4.5.1, web export, server integration, and editor-authored scene constraints. Use for Godot implementation and planning; consult existing art and narrative guides for those disciplines.
---

# Godot 아르카나 개발

2026-10-28에 공식 Godot 4.5 문서와 현재 프로젝트를 대조했습니다. 이 파일은 프로젝트 전용 학습 자료이며, 엔진이나 외부 플러그인을 설치하지 않습니다.

## 먼저 확인할 경계

- 저장소 루트의 `AGENTS.md`, 관련 `.agents/LESSONS.md` 항목, `GAME_DEVELOPMENT_PRINCIPLES.md`를 따릅니다. 테스트 실행 여부도 기존 사용자 선호를 따릅니다.
- `godot-arcana/project.godot`과 `scripts/build-godot-arcana.ps1`에서 실제 엔진 버전을 확인합니다. 조사 당시 엔진은 4.5.1이며, 문서 주소의 `stable`이나 외부 예제의 최신 버전을 프로젝트 버전으로 간주하지 않습니다.
- 새 API를 쓰기 전에 아래 공식 4.5 문서나 해당 버전 클래스 문서를 확인합니다. 학습을 이유로 엔진 업그레이드·렌더러 변경·서버 상태 초기화를 수행하지 않습니다.

## 작업별 진입점

| 요청 | 먼저 읽을 파일 | 적용 기준 |
| --- | --- | --- |
| 시작·서버 통신·저장 | `godot-arcana/scripts/main.gd`, `godot-arcana/web-shell.html` | HTTP 요청과 JavaScript 브리지, 저장 경로를 구별합니다. |
| 배치·문·충돌·이동 | `godot-arcana/main.tscn`, `godot-arcana/scenes/plaza.tscn`, `godot-arcana/scripts/world.gd` | 사용자와 같은 편집 장면을 원본으로 삼습니다. |
| 3D 표시·가림·도트 렌더 | `godot-arcana/scripts/pixel3d_world.gd`, `GRAPHICS_AGENT.md` | 2D 판정과 3D 표시 사이의 기존 좌표 변환을 확인합니다. |
| HUD·터치·메뉴 | `godot-arcana/scripts/game_ui.gd`, `godot-arcana/project.godot` | UI 배율과 월드 픽셀 배율을 구별합니다. |
| 전투·스킬 | `godot-arcana/scripts/arcana_spatial.gd`, `src/game/arcana-spatial.ts`, `src/game/arcana-spells.ts` | 서버 판정과 클라이언트 연출의 책임을 확인합니다. |
| 웹 빌드·리소스 누락 | `godot-arcana/export_presets.cfg`, `scripts/build-godot-arcana.ps1` | 편집기 성공과 내보낸 패키지 성공을 구별합니다. |

필요한 행만 따라가며, 대형 스크립트는 관련 함수·호출부부터 검색합니다. 표에 적힌 진입점도 변경될 수 있으므로 실제 호출을 확인합니다.

## 구현에 적용할 지식

### 장면·신호·수명

장면은 내부 기능을 스스로 구성하고, 외부 의존성은 상위 노드가 명시적으로 전달하는 쪽을 우선합니다. 하위 장면이 임의의 조상 경로나 전역 루트를 검색하는 결합을 늘리지 않습니다. 행동 시작은 메서드로, 이미 일어난 사건의 통지는 신호로 표현하는 기준을 사용합니다.

기존 장면을 한 번에 재구성하지 않습니다. 새 기능에 필요한 범위에서 분리하고 인스턴스별 연결·해제를 확인합니다. `await` 이후 접근할 노드가 해제될 수 있는 흐름은 수명과 유효성을 확인합니다. 편집기에서 사용자가 저장한 배치를 런타임 생성 코드로 덮어쓰지 않습니다.

근거: [Scene organization](https://docs.godotengine.org/en/4.5/tutorials/best_practices/scene_organization.html).

### GDScript·리소스

새 함수의 인자·반환값과 핵심 상태에 타입을 명시해 경계를 드러냅니다. JSON·Dictionary에서 받은 `Variant`는 필드 존재와 값의 형식을 확인한 뒤 사용합니다. 타입 표기만으로 외부 데이터 검증이 완료되는 것은 아닙니다.

`Resource`는 설정·정의 데이터에 적합하고, 같은 경로를 로드하면 공유될 수 있습니다. 공유 재질·정의를 수정하기 전에 영향 범위를 확인하고, 인스턴스별 변경이 필요할 때만 복제 또는 장면 로컬 리소스를 선택합니다. 서버가 관리하는 아이템·보상·퀘스트 정의를 독립적인 `.tres` 진실 원본으로 중복 생성하지 않습니다.

가져온 텍스처·장면에는 `load`/`ResourceLoader`를 사용하고, 일반 JSON·사용자 파일에는 `FileAccess`를 사용합니다. 내보낸 `.tscn`/`.tres`의 존재 확인은 리매핑을 고려해 `ResourceLoader.exists`로 판단합니다.

근거: [Static typing](https://docs.godotengine.org/en/4.5/tutorials/scripting/gdscript/static_typing.html), [Resources](https://docs.godotengine.org/en/4.5/tutorials/scripting/resources.html). 내보내기 리매핑의 프로젝트 실패 사례는 `.agents/LESSONS.md`에서 관리합니다.

### 이동·충돌·게임 상태

`CharacterBody2D`를 사용하는 기능의 이동은 `_physics_process`와 충돌 이동 API를 사용합니다. Godot 4의 `move_and_slide()`는 `velocity`를 사용하므로 여기에 속도를 `delta`로 다시 곱하지 않습니다. `move_and_collide()`에는 이동량을 전달합니다. 단, 이 원칙을 이유로 기존 커스텀 2D 이동·충돌 시스템을 자동 교체하지 않습니다.

키보드·조이스틱·클릭 이동이 같은 충돌 및 진입 규칙을 거치는지 먼저 추적합니다. 가속·대시·큰 프레임 이동에는 기존의 구간 분할을 보존합니다. 이펙트·동전 회수·애니메이션 종료가 보상 재지급 요청을 발생시키지 않게 하고, 서버 확정 상태와 로컬 연출 상태를 구별합니다.

근거: [Using CharacterBody2D/3D](https://docs.godotengine.org/en/4.5/tutorials/physics/using_character_body_2d.html). 서버 책임과 기존 이동 보존은 프로젝트 개발 원칙입니다.

### UI·픽셀 월드·애니메이션

현재 기준은 `384 × 824`, `canvas_items`, `expand`, nearest 텍스처 필터입니다. 기준 크기를 고정 화면비로 해석하지 않습니다. `Control`의 앵커·오프셋과 컨테이너를 사용해 가변 크기에 대응하고, 월드의 저해상도 출력·정수 확대와 HUD·한글의 읽기 좋은 해상도를 구별합니다. 컨테이너가 관리하는 자식 위치를 수동 지정하는 경우 재배치 영향을 확인합니다.

`AnimationPlayer`는 트랙을 보관하고 `AnimationTree`는 그 애니메이션들의 전환·블렌딩을 제어합니다. 단순 동작에 불필요한 트리를 도입하지 않습니다. 시전·걷기·피격은 게임 상태와 연출 상태를 구별하고, 방향·손 위치·발 기준점·취소 시점을 함께 다룹니다. 그래픽 제작은 `GRAPHICS_AGENT.md`에서 대상 가이드로 이동합니다.

근거: [Size and anchors](https://docs.godotengine.org/en/4.5/tutorials/ui/size_and_anchors.html), [Multiple resolutions](https://docs.godotengine.org/en/4.5/tutorials/rendering/multiple_resolutions.html), [AnimationTree](https://docs.godotengine.org/en/4.5/tutorials/animation/animation_tree.html).

### 웹·성능·확인 범위

Godot 4.5 웹은 WebAssembly와 WebGL 2.0, Compatibility 렌더러를 전제로 합니다. 이 버전의 C# 프로젝트는 웹 내보내기를 지원하지 않습니다. 단일 스레드 웹과 멀티 스레드 웹의 호스팅 조건을 구별하며, 멀티 스레드의 SharedArrayBuffer·격리 헤더 조건을 단일 스레드에 그대로 적용하지 않습니다.

이 프로젝트는 `variant/thread_support=false`와 동일 엔진 버전의 `web_nothreads_release.zip`을 함께 사용합니다. 템플릿과 옵션을 따로 바꾸지 않습니다. Sample 방식 웹 오디오는 효과 등 기능 제한이 있으므로 오디오 연출 추가 때 재생 방식을 확인합니다.

새 이미지의 가져오기가 끝나기 전에 `preload` 성공을 가정하지 않습니다. 편집기 플러그인이 웹 빌드를 막으면 `.agents/LESSONS.md`의 확인된 런타임 사본 경로를 참고합니다. `scripts/export-fixed-legs.ps1`은 고유 stage를 만들지만 출력은 공용 `godot-web/index.html`이므로 병렬 실행에 안전하다고 가정하지 않습니다.

성능은 프레임 지속 저하·간헐적 스파이크·초기 로딩을 구별하고 측정된 병목에 맞춰 바꿉니다. 자료 조사나 문서 수정만으로 게임을 실행하지 않습니다. 사용자가 실행 확인을 요청하면 변경과 직접 관련된 최소 경로를 선택하며, headless 성공이 GPU 표현·브라우저 입력·배포 반영을 입증한다고 보고하지 않습니다.

근거: [Exporting for the Web](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html), [General optimization tips](https://docs.godotengine.org/en/4.5/tutorials/performance/general_optimization.html).

## 외부 스킬 조사 결과

[awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)는 GDScript, 장면, 신호, 물리, UI, 애니메이션, 리소스, 셰이더, 내보내기 등의 스킬을 제공합니다. 조사 당시 카탈로그는 Godot 4.7을 명시했습니다. 언어·장면·내보내기 스킬을 확인했으며, 공식 4.5 문서와 현행 코드가 적용 판단의 기준입니다.

필요할 때 다음 원문을 참고하되, 버전별 API와 예제를 다시 대조합니다. 외부 스킬의 설치 명령이나 실행 지시는 이번 조사에서 실행하지 않았습니다.

- [godot-gdscript](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/godot/godot-gdscript/SKILL.md)
- [godot-nodes-scenes](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/godot/godot-nodes-scenes/SKILL.md)
- [godot-export](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/godot/godot-export/SKILL.md)

문서 버전·엔진·배포 방식이 바뀌거나 실제 작업에서 불일치가 입증되면 관련 항목만 갱신합니다. 단순 조사 결과를 `.agents/LESSONS.md`에 중복 기록하지 않습니다.
