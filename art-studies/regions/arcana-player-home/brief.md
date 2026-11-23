# 아르카나 내 집 · 학교 뒷골목 하숙집

사용자가 선택한 [A안](concept-campus-a.png)을 바탕으로 [Blender 원본](player-home-campus-a.blend)을 제작했습니다. 왼쪽에 주방, 오른쪽 앞에 거실, 오른쪽 뒤에 작은 침실이 있습니다. 거리 쪽은 크림색 석재와 남색 창틀, 실내는 꿀빛 바닥과 자주색 안락의자로 구성합니다.

## 광장 외관

분수 동쪽에 A안의 남색 기와, 크림색 석재, 두 창의 화분과 황동 벽등으로 집 외관을 배치했습니다. 광장에서 집을 누르거나 **지도 → 내 집**을 고르면 현관 앞으로 걸어갑니다. 현관을 통해 들어간 뒤 나오면 문 앞 통행 공간으로 돌아옵니다.

[외관 Blender 원본](player-home-plaza-exterior.blend)에는 석재 벽, 기와 지붕, 문·창·현관, 화분을 각각 별도 컬렉션으로 두었습니다. [광장 씬](../../../godot-arcana/scenes/plaza_3d_v2.tscn)의 `PlayerHome` 아래에 [외관 GLB](../../../godot-arcana/art/source/player-home-campus-a/plaza-home-exterior.glb), 건물 충돌과 현관 접근점을 배치했습니다. 접근점과 복귀점은 광장 씬에서 서버용 레이아웃으로 함께 내보냅니다. [광장 렌더](plaza-home-godot.png)

## 생활 소품

조리대의 도자기·빵·행주, 거실의 펼친 공책·찻잔·담요, 침실의 별 자수·가죽 책가방을 각 가구 컬렉션 안에 배치했습니다. 작은 교기와 창틀의 황동 걸쇠는 붙어 있는 벽과 함께 표시합니다. [디테일 추가 스크립트](detail_campus_a.py)는 디테일 추가 전 A안 Blender 원본에 적용합니다.

## 실내 조명

주방 조리대의 황동 랜턴과 거실 작업대의 초록 갓 스탠드를 독립 가구로 배치했습니다. 주방과 거실에는 작은 온색 조명을, 침실에는 등불과 창가의 푸른 빛을 배치했습니다. 조명 오브젝트는 각 방에 배치된 가구와 Godot 씬에서 조정할 수 있습니다. Blender 편집에는 [조명 추가 스크립트](light_campus_a.py)를 사용했습니다.

## 벽 표시 설정

게임 카메라에서 화면 왼쪽 위와 오른쪽 위의 뒤 벽면과 창은 항상 표시합니다. 기본 화면에서 카메라 쪽 외벽은 0.30m, 실내 칸막이는 0.57m 높이에서 절개합니다. **모험 메뉴 → 화면 설정 → 내 집 앞벽과 칸막이**를 켜면 윗부분도 나타납니다. 이 설정은 기기에 저장되며 통행과 상호작용 좌표는 두 모드에서 같습니다.

## 실내 개선 제안 · 세면·목욕실과 현관 수납

[평면 설계도](home-additions-floor-plan.png)와 [아이소메트릭 시안](home-additions-concept.png)은 검토용입니다. 기존 주방·침실·거실과 외곽을 기준으로, 현관 왼쪽에는 세면·목욕실, 오른쪽에는 얕은 수납 벤치를 더하는 안입니다.

- 목욕실은 주방 앞 여유 공간인 `x 3–9m, z 13.55–16.50m`에 둡니다. 실내 크기는 `6.0 × 2.95m`, 현관 쪽 새 개구부 폭은 `1.75m`입니다. 입구 쪽 바닥은 비워 둡니다.
- 회청색 석재 바닥에 나무 욕조와 도기 세면대, 접은 수건을 배치합니다. 수납 벤치는 현관 오른쪽 앞벽을 따라 두고 출입구와 거실 러그 사이 통로를 확보합니다.
- 기본 카메라에서 화면 왼쪽 위와 오른쪽 위의 기존 벽면을 표시합니다. 새 목욕실 칸막이는 앞벽과 같은 낮은 단면으로 그렸습니다. 치수와 출입 폭은 평면 설계도를 기준으로 합니다.
- 시안은 Godot의 기존 방 정지 렌더를 바탕으로 내장 ImageGen에서 제작했습니다. 제작 단계에서 새 개구부와 가구의 충돌을 확인합니다.

<details>
<summary>ImageGen 입력</summary>

입력 순서는 기존 방 정지 렌더(`.runtime/home-walls-viewport.png`), [실내 참조](../../../docs/art-reference/stardew-projection/interior-furniture.png), [야외 참조](../../../docs/art-reference/stardew-projection/outdoors-summer.png), [기하 가이드](../../../godot-arcana/art/reference/projection-lock/front-orthographic-45.png)입니다.

```text
Use case: precise-object-edit / stylized-concept for original game Arcana.
Create one high-fidelity art concept image depicting a proposed remodel of the existing Arcana home. Edit Image 1 as the primary base. Image 1 is the actual in-engine static house view; preserve the composition, orientation, scale, existing house silhouette, lighting, dark backdrop, clean modeled pixel-art feel, actual kitchen, bedroom, and purple-rug living area precisely. Images 2 and 3 are archival environmental/furniture material and proportion references only; draw all new objects from scratch within Arcana's original visual identity, without copying sprites or furnishing designs. Image 4 is a legacy geometry reference for relative height and scale only; keep the primary image's 2:1 orthographic projection.
Make two localized changes exclusively inside the existing rectangle:
1. A small enclosed wash-and-bath room in the far LOWER-LEFT / CAMERA-NEAR LEFT tip of the floor plan between the left end of the low front slate-edged outer wall and the front/main entrance. It occupies only the open floor patch toward the front-left of the black kitchen stove, not any of the stove, countertop, runner, or shelving. In the 1000 x 730 base image the approx quadrilateral ground corners are (72,344), (158,301), (332,388), (245,430); keep the new interior floor and fixtures entirely inside that patch, adjusting to the actual floor. The space is rectangular, 6 across by 2.95 deep in room units, one open doorway on its short east/right-in-top-view end, visually nearest the main entry. Use blue-grey/jade square stone floor tiles, a softly rounded low oval cedar soaking tub with a little pale teal water in its left portion, a compact handmade cream ceramic washbowl on a short narrow oak stand and rolled towels toward the low front perimeter, with the end nearest the doorway clear. This is lived-in, compact wizard-academy lodging, restrained with familiar Arcana materials. Delimit the new room with 0.57m low cutaway stone and navy cap, leaving a clear open threshold from the existing wooden entry hall. Keep the kitchen door behind it continuous and clear.
2. Immediately to the right of the existing front entrance steps and to the near edge of the living area's purple rug, place ONE shallow low honey-oak storage bench with muted navy detail and compact leather satchel, tucked flush INSIDE the low front wall. Put the bench beside the passage (roughly x412-463 at the ground in the base), clear of the threshold and away from the stool. Keep existing purple rug placement and living furniture.
The two tall joined rear wall faces occupying the UPPER LEFT and UPPER RIGHT remain fully readable and at the original full height, with original indigo coping, windows, braces, and pennant. Preserve foreground architectural cutaway with all camera-near edges kept low and no roof. Preserve original room envelope, door threshold, steps, brick/wood floor edges, kitchen counter and black stove, bedroom bed, wardrobe, table, lights, shelves and existing furniture. Fixed ortho camera looking from +X,+Z at 30 degrees down, every horizontal ground edge projects 2 horizontal pixels for 1 vertical pixel and all verticals align on screen. Keep one wide landscape composition showing the entire house. Output a visually polished concept illustration only. No labels, no text, no annotation arrows, no frame, no characters, no additional rooms, and no exterior scenery.
```

</details>

## 실측형 평면도

[실측형 평면도](home-real-scale-floor-plan.png)를 본편 ‘내 집’의 실내에 적용했습니다. 외곽은 `9,400 × 6,650mm`, 외벽 안쪽은 `9,000 × 6,250mm`입니다. 외벽 안쪽 면적 `56.25㎡`에는 실내 칸막이가 포함됩니다. 외벽 두께는 `200mm`, 칸막이는 `120mm`입니다.

- 침실은 `4,350 × 3,000mm`로 잡고, 옷장과 침대 사이 및 침대 발치에 이동 공간을 뒀습니다. 현관에서 연결되는 주 통로는 너비 `1,100mm`를 확보했습니다.
- 세면·목욕실은 `2,350 × 2,230mm`에 욕조·세면대·변기·고창을 배치했습니다. 폭 `800mm` 미닫이문 자리는 열린 출입구로 모델링했습니다. 주방 싱크와 욕실 세면대는 같은 설비벽을 사용합니다.
- 도면 위쪽과 왼쪽 외벽을 게임 화면에서 뒤 벽으로 표시합니다. 현관 도착점에서 욕실과 요리·제작·잠자리·휴식·외출 지점으로 이어지는 이동 데이터를 새 배치에서 내보냅니다.

소형 주택의 방 크기, 가구·위생기구 배치, 문·창 기호는 [Uniplan Group의 Abbott 도면](https://www.uniplangroup.com.au/wp-content/uploads/2024/03/Residential-Floorplan-Download-Abbott.pdf)과 [Flat Grannys의 The Edna 도면](https://www.flatgrannys.com.au/pdf/FlatGrannys_TheEdna_one-sheet.pdf)을 참고했습니다. 침실과 집 전체의 면적은 [잉글랜드 주거 면적 기준](https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard/technical-housing-standards-nationally-described-space-standard)의 침실 1개 단층 주택 수치와 비교했습니다.

## Blender에서 Godot으로

[Godot 씬](../../../godot-arcana/scenes/player_home_3d.tscn)은 [실측형 건축과 새 가구](../../../godot-arcana/art/source/player-home-real-scale), [A안에서 이어 쓰는 가구](../../../godot-arcana/art/source/player-home-campus-a)를 개별 노드로 배치합니다. 집은 여관과 같은 픽셀 셰이더를 사용합니다.

| 구분 | Blender 컬렉션과 GLB |
| --- | --- |
| 기본 건축 | `architecture`의 바닥, 하부 벽, 문턱, 현관 계단 |
| 뒤 벽면 | `rear-walls`의 화면 왼쪽 위·오른쪽 위 벽과 창틀 |
| 표시 설정 | `upper-walls`의 화면 앞쪽 외벽과 칸막이 윗부분 |
| 주방 | `kitchen-hearth`, `kitchen-counter`, `kitchen-prep`, `kitchen-dining-table`, `kitchen-shelf`, `kitchen-runner`, `kitchen-task-lantern` |
| 침실 | `bedroom-bed`, `bedroom-wardrobe`, `bedroom-lamp`, `bedroom-rug` |
| 거실과 현관 | `living-bookcase`, `living-planter`, `living-rug`, `living-sofa`, `living-stool`, `living-worktable`, `living-study-lamp`, `living-coffee-table`, `entry-bench`, `entry-rug` |
| 세면·목욕실 | `bath-tub`, `bath-vanity`, `bath-toilet` |

실측형 건축은 [Blender 원본](player-home-real-scale.blend)을 저장한 뒤 백그라운드에서 [건축 내보내기](author_real_scale.py)로 갱신합니다. 새 가구는 A안 Blender 원본을 열어 [가구 내보내기](author_real_scale_fixtures.py)로 생성합니다. Godot 가구 노드를 이동하면 통행 영역과 상호작용 지점도 따라갑니다. 건축 충돌 사각형은 씬의 `Room/Architecture`에서 관리합니다. 배치를 바꾼 뒤에는 [온라인 레이아웃 내보내기](../../../godot-arcana/tools/export_online_layout.gd)로 서버 좌표를 갱신합니다.

분수 광장에서는 **생활 수첩 → 내 집으로**도 사용할 수 있습니다. 주방에서는 요리하고 거실에서는 제작하거나 안락의자에서 식사할 수 있습니다. 침실에서 하루를 마치고 현관으로 나가면 입장 위치에 따라 집 앞이나 광장의 원래 위치로 돌아갑니다.
