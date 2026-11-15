# 월드 제작 담당

아르카나의 지역·건물·지면·가구·식생·소품 제작과 배치를 이 문서에서 관리합니다. 사용자 저장 장면이 배치 원본이며 디자인 가이드의 과거 좌표나 생성기로 덮어쓰지 않습니다. 캐릭터는 [캐릭터 아트 담당](CHARACTER_ART.md), 구현·서버·UI는 [개발 담당](DEVELOPMENT.md), 장소 설명·대사는 [서사 담당](NARRATIVE.md)을 따릅니다.

## 지역별 가구·사물 찾기와 배치

본편의 재사용 가능한 사물은 [scenes/props](../../godot-arcana/scenes/props/)에 **지역 → 종류 → 사물** 순서로 정리합니다. [prop-library.json](../../godot-arcana/data/prop-library.json)은 파일·지역·종류를 찾는 색인입니다. 지역은 `plaza`, `city-walk`, `inn`, `academy-first-floor`, `academy-second-floor`, `shop`으로 나누며 공용 침대는 `shared/beds/`에 둡니다. `_2d.tscn` 침대는 2D 배치용이고 나머지 Node3D 침대는 모델 제작용입니다. 카탈로그의 `root_type`을 확인해 같은 2D 씬에 혼합 배치하지 않습니다.

1. Godot FileSystem에서 원하는 지역·종류의 `.tscn`을 골라 대상 지역 장면에 드래그합니다.
2. 그림만 복사하지 않고 원본의 표시·접지·충돌·깊이·조명 설정을 가진 씬 인스턴스로 배치합니다.
3. 새 사물을 추가했다면 `gameplay_id` 및 `metadata/layout_entity.id`가 기존 사물과 겹치지 않도록 고유하게 지정합니다. 장식에 기능이 없으면 임의의 상호작용 ID를 만들지 않습니다.
4. 문 앞·벤치 앞·통행로를 확보하고 접지점과 앞뒤 가림을 확인합니다. 그림 크기를 전체 충돌 영역으로 사용하지 않습니다.

상점의 가구는 `scenes/props/shop/furniture/`, 벽은 `scenes/props/shop/architecture/`에 있습니다. 카운터·출입문은 상점의 고유 기능을 소유하므로 추가 배치 전에 `shop_layout_2d.gd`의 제약을 확인합니다.

사물 씬은 기존 텍스처를 참조하며 중복 PNG를 만들지 않습니다. 공용 텍스처 원본은 실제 원본 폴더와 등록을 따릅니다. 지역 전체의 바닥·벽 기하와 NPC는 사물 라이브러리와 구별합니다.

실제 배치 원본은 [scenes/native_2d](../../godot-arcana/scenes/native_2d/)와 [shop_2d.tscn](../../godot-arcana/scenes/shop_2d.tscn)입니다. 플레이 장면을 재생성해 사용자 Transform·상호작용·충돌 변경을 초기화하지 않습니다. 시작 장면에 저장된 인스턴스 오버라이드도 배치의 일부입니다.

## 현재 미술 방향

작은 캐릭터가 정교하고 생활감 있는 마법도시를 걷는 모습을 목표로 합니다. [도시 분위기 참조](../art-reference/arcana-city-target/city-mood-reference.png)의 따뜻한 상아색 석재·목재, 파란 지붕과 깃발, 녹색 식생, 금빛 장식과 등불을 참고합니다. 참조 이미지의 출처나 실제 픽셀 규격을 확인한 것으로 간주하지 않습니다.

**가로등과 천체 분수**가 현재 야외의 품질·재질·도트 밀도 기준입니다. 승인 디자인·분수 애니메이션을 유지하고 기존 건물·식생·소품으로 구도와 밀도를 먼저 맞춥니다. 분수 주변과 건물 전면이 함께 보이는 한 구역의 완성도를 높인 뒤 확장합니다. 길·문·벤치 접근 공간을 장식으로 막지 않습니다.

| 대상 | 현재 선택과 보존할 사항 |
| --- | --- |
| 도시 기본 바닥 | `art/source/square-floor-v2/paving.pxpen` → `art/export/square-floor-v2/paving.res`. 사용자 선택 02번 크림색 사각 석재, 320×320 원본 주기, `stone_pattern_period=(320,320)`, `stone_sample_scale=1`. |
| 분수 바닥 | 승인된 청금석 모자이크·금빛 별·크림 방사형 석재. 분수 본체·문양 좌표·기단·충돌을 유지합니다. |
| 강 | `art/source/river-pixel-v5/`. 맑은 청색 16색, 바탕/잔물결, 16프레임 8fps HighlightFlow와 기존 반사. 전체 UV 스크롤·사인 변형으로 대체하지 않습니다. 다리·석축·이동·낚시 판정을 유지합니다. |
| 여관 | 따뜻한 꿀빛 목재·크림 벽, 보라 소파·러그, 푸른 담요, 벽난로·접수대·책장. 2D 독립 모듈을 사용하며 사용자 저장 배치를 우선합니다. |
| 실내 외곽 | 위·옆·앞의 벽 단면, 모서리·코핑·걸레받이·문 끝단을 마감합니다. 영역 밖은 순수 검정 `#000000`이며 팔레트 처리로 바꾸지 않습니다. |

기준은 현재 연결된 파일과 명세입니다. 과거 제작 기록에 있는 ‘현재/최신’ 제목이나 가장 큰 버전 숫자만으로 활성 자산을 고르지 않습니다.

## 공통 투영과 크기

새 사용자 지시 → 대상의 승인 외형·등록값 → 공통 투영 → 신규 자산 권장 치수 순으로 판단합니다. 초상화·UI는 이 공간 투영을 적용하지 않습니다.

| 항목 | 규격 |
| --- | --- |
| 카메라 | 정면형 3/4 정사영, yaw 0°, 지면에 대한 하향각 45°, roll 0° |
| 축 | +X 화면 오른쪽, +Z 화면 아래, +Y 화면 위 |
| 밀도 | 월드 1단위 = 이동 좌표 16 = 원본 가로 64px |
| 상대 투영식 | `u=64X`, `v=64(Z sin45° − Y cos45°)` |
| 지면 1×1단위 | 화면 약 64×45.25 원본 px |
| 수직 높이 1단위 | 화면 약 45.25 원본 px |
| 수평 원판 | 장식·테두리·가림을 제외한 높이/폭 약 0.707 |
| 표시 | 최근접 정수 확대, 비균등 늘리기 금지 |

정면 가로변은 수평, 기둥은 수직, 미회전 물체의 깊이는 화면 세로축을 따릅니다. 소실점 원근법·다이아몬드 등각 격자·2:1 등각 투영을 섞지 않습니다. 옆면을 더 보이려고 카메라 yaw를 45°로 바꾸지 않고 물체 자체의 회전을 지정합니다. 타원형·기울어진 면이나 분수 전체 실루엣에 원판의 0.707을 강제하지 않습니다.

캔버스·불투명 실루엣·바닥 점유·수직 높이·표시 배율은 다른 값입니다. 예를 들어 W=2, D=1, H=1인 상자는 폭 128px, 윗면 깊이와 수직 높이 각각 약 45.25px입니다. 기존 건물의 사용자 배치 확대율을 새 미술의 원본 밀도로 복사하지 않습니다.

가구는 기본 반 칸 점유부터 설계합니다. 홀수 반 칸 폭은 중심 피벗이 사분의 일 칸에 놓일 수 있으므로 중심보다 점유 사각형의 변 정렬을 우선합니다. 일반 선반 2×1, 긴 선반 2.5×1, 작업대 3×1, 낮은 진열대 1.5×1칸은 시작값이며 승인 자산을 강제로 늘이는 값이 아닙니다.

| 새 자산의 시작값 | 폭 W | 바닥 깊이 D | 높이 H |
| --- | --- | --- | --- |
| 문 개구부 | 0.75~1 | 문턱 0~0.25 | 2.25~2.5 |
| 의자 | 0.75~1 | 0.75~1 | 등받이 1.25~1.75, 좌면 0.5~0.65 |
| 1인 침대 | 1~1.25 | 2~2.5 | 매트리스 0.5~0.75 |
| 2인 침대 | 2~2.5 | 2~2.5 | 매트리스 0.5~0.75 |
| 작은 탁자 | 1~1.5 | 0.75~1 | 0.8~1 |
| 식탁·작업대 | 2~3 | 1~1.5 | 0.8~1.1 |
| 책장·수납장 | 1.5~2.5 | 0.5~1 | 2~3.25 |
| 상자·통 | 0.75~1 | 0.75~1 | 0.6~1.2 |
| 관목 | 1~2 | 0.75~1.5 | 0.5~1.25 |
| 성목 | 수관 2.5~4 | 줄기 접지 1~1.5 | 3.5~6 |
| 작은 건물 | 4~7 | 3~5 | 벽 2.5~3.5, 지붕 별도 |

이는 원작 실측이나 기존 자산의 강제 치수가 아닙니다. 문·의자·침대를 확정 하이브리드 캐릭터와 같은 배율로 나란히 비교하고 현재 등록값을 우선합니다.

## 제작에 넣을 참조

공간 이미지 생성·편집은 컨셉 단계부터 아래 두 보관 타일셋과 대상 치수의 기하 가이드를 실제 이미지 입력으로 사용합니다.

- [스타듀밸리 실내·가구 참조](../art-reference/stardew-projection/interior-furniture.png): 면 노출, 문·탁자·의자·침대의 상대 크기.
- [여름 야외 참조](../art-reference/stardew-projection/outdoors-summer.png): 건물 벽·지붕, 나무·그루터기, 절벽·지면 연결.
- [아르카나 기하 가이드](../../godot-arcana/art/reference/projection-lock/front-orthographic-45.png): 투영의 수치 기준.

원작 자산은 분석용이며 납품 이미지로 복사하지 않습니다. 타일셋의 여백·전체 크기를 월드 거리로 읽거나 원작 캐릭터 비례를 여기서 측정했다고 주장하지 않습니다. 원작의 모든 수작업 변형에서 정확한 카메라 각도를 역산할 수 있다고 가정하지 않습니다.

기하 참조는 투영, 승인 가로등·분수는 디자인·재질·디테일, 편집 대상은 유지할 외형 참조로 역할을 구별합니다. 실제 참조를 전달하지 못했다면 그 제한을 기록합니다. 프롬프트에 각도를 썼다는 사실만으로 정확한 그림이라고 판정하지 않습니다.

```text
CAMERA AND SCALE LOCK — Arcana world asset / room:
Fixed front-facing orthographic RPG camera, yaw 0, elevation 45 degrees
above horizontal ground, roll 0. Use the supplied geometry guide as
projection authority. +X projects right, +Z down, +Y up.
64 source pixels per world unit: u=64*X; v=64*(Z*sin45-Y*cos45).
Keep front/back horizontal edges level, vertical posts vertical, and
parallel edges equal without perspective convergence or distance scaling.
Show declared top surfaces; a horizontal circular disk projects at
height/width about 0.707 excluding rim, decoration and occlusion.
Use the supplied Stardew sheets for plane readability and relative scale,
not copied designs. Approved lamp/fountain references set style/material.
Object: [name]; W/D/H: [values]; object rotation: [value]; footprint: [value];
ground/door/foot pivot: [value]; compare against: [approved scale anchor].
Keep this camera for all objects. No diamond-isometric grid, 2:1 isometric
projection, vanishing points, eye-level elevation, or camera yaw 45.
Preserve approved palette, identity and upper-left lighting.
```

대상 치수의 SVG·PNG·기준점 JSON은 기존 도구로 만듭니다. 새 도구 설치가 필요하지 않습니다.

```powershell
node scripts/author-arcana-projection-guide.cjs --width 2 --depth 1 --height 3.25 --out art-studies/regions/<region-id>/source/projection
```

## 지역 제작과 PixelPen 공정

새 지역은 [맵 제작 스킬](../../skills/arcana-map-builder/SKILL.md)과 지역 명세 `art-studies/regions/<region-id>/brief.md`를 사용합니다. 기존 작업을 이어갈 때는 새 명세를 만들지 않습니다. 승인 이미지·범위·진입/복귀 위치·실제 연결·다음 행동을 명세에 유지합니다.

1. 용도·필수 건물·랜드마크·이동 동선·문 앞·점유·높이·접지·벽 접점을 먼저 정합니다. 기능 없는 문은 준비 중으로 남깁니다.
2. 두 타일셋·기하 가이드·승인 디자인으로 시안 한 장을 제시합니다. 새 미술은 [arcana-2d-art 스킬](C:/Users/BANG/.codex/skills/arcana-2d-art/SKILL.md)의 명시적 승인 절차를 따릅니다. 이미 승인된 범위와 단순 오류 수정에 승인을 반복하지 않습니다.
3. 승인 범위에서 건물·바닥·가구를 독립 자산으로 만듭니다. 큰 지역 원화 한 장 축소로 이동·충돌·가림을 대신하지 않습니다. 기존 2D 환경을 임의의 3D 메시로 바꾸지 않습니다.
4. 기하 → 큰 실루엣·색 덩어리 → 재질별 3~5단계 주요 명암 → 도트 마감 순서로 작업합니다. 투영·축척 오류를 장식 전에 고칩니다.
5. PixelPen에서 계단·고립 픽셀·접합·알파 테두리를 보정하고 **`.pxpen` 저장 → 재열기 → PNG 출력**합니다. 기존 수동 원본을 보존하며 축소·팔레트 변환만으로 완성 처리하지 않습니다.
6. 원본·프롬프트·캔버스·자르기 영역·접지 피벗·점유·돌출·충돌·가림·레이어·출력 경로를 등록합니다. 실제 소비 코드가 없는 manifest를 등록했다는 이유로 자동 연결됐다고 보고하지 않습니다.
7. 같은 카메라·배율에서 전후·기준물·인물을 비교하고 요청 범위의 본편 연결을 완료합니다. 게임 실행은 사용자 요청 기준을 따릅니다.

새 환경 자산은 TileSet 항목·패턴 또는 재사용 씬으로 제공해 직접 고르고 배치할 수 있게 합니다. 벽의 직선·모서리·끝단·문턱·바닥부터 작은 세트로 조합합니다. 수직선·두께·상단·걸레받이의 좌표를 공유하고 틈·겹선·잘린 마감을 정리합니다. 반복 소재와 카펫·천체 문양·조명은 분리합니다.

## 배치·가림·그림자

사용자 저장 Transform과 ID를 보존합니다. 표시·충돌·문 Marker·조명은 같은 부모 Transform을 따르게 합니다. 그림 오차를 숨기려고 건물·나무 크기나 충돌을 바꾸지 않습니다. 벤치 앞이 막혔다면 벤치를 이동하거나 충돌을 끄기 전에 화단·울타리·상자를 옆·뒤로 재배치합니다.

앞뒤는 실제 발·바닥 접점을 기준으로 맞추고 나뭇잎·지붕·등받이 돌출을 점유 면적과 구별합니다. 가림 완화는 고른 알파 반투명으로 유지하며 픽셀 구멍·다이아몬드 패턴으로 바꾸지 않습니다. 조명용 높이·노멀 근사 맵은 완성된 가림 데이터가 아닙니다.

야외의 햇빛 기준은 `scenes/native_2d/plaza.tscn`의 `Sunlight/SunPosition`, `Sun Height`와 저장된 진하기입니다. `native_2d_sunlight.gd`의 같은 투영·접지를 편집기/게임에서 사용합니다. `native_2d_placement.gd`의 **Casts Sun Shadow**는 지상 사물에 기본 켜고, 일반 노드에는 `casts_sun_shadow` 메타데이터를 사용합니다. 바닥·평면 데칼·빛·효과와 z_index ≤ -20 바닥 레이어는 제외합니다. 별도 타원 그림자를 원본에 중복으로 굽지 않습니다.

실내는 전체 방이 두 축 모두 화면 안에 들어오면 방 중심, 한 축이라도 벗어나면 인물 중심을 기준으로 합니다. 사용자 카메라 설정과 현재 구현을 확인하며 폴더 정리만을 이유로 초기화하지 않습니다. 벽 부착물 뒤에 창문이 겹치거나 가구가 상단 마감을 뚫지 않게 합니다.

## 완료와 인계

원본 픽셀·정수 확대, 같은 카메라 전체 구도와 문 옆 인물, 접지·앞뒤·점유·충돌·출입 연결을 구분해 확인합니다. 사용자 미술 승인·파일 저장·구조 검사·정지 렌더·패키지 포함·브라우저 플레이는 서로 다른 증거입니다. 실행하지 않은 검사는 미확인으로 남깁니다.

설계 중 → 시안 승인 대기 → 제작 중 → 배치·연결 중 → 사용자 확인 대기 → 완료 상태를 지역 명세에서 이어갑니다. 작업 이력은 [보존 기록](../archive/ART_HISTORY.md)이며 현행 규격을 고르는 진입점이 아닙니다. 폐허 서울의 육각 지도·초상화와 해당 자산은 [별도 프로젝트](../../../seoul-survival/README.md)에서 관리합니다.

제작 원리 참고: [Saint11 · 3D reference](https://saint11.art/blog/3d-ref/), [Consistency](https://saint11.art/blog/consistency/), [Cluster sketching](https://saint11.art/pixel_art_articles/article2/). 공통 45°·64px 수치는 원작의 실측이 아니라 아르카나의 제작 계약입니다.
