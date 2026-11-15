# 아르카나 여관 실내

`arcana_inn`에 승인된 Blender 로비를 적용했습니다. Godot 3D 씬은 외형과 카메라를 담당하고, 기존 2D 씬은 이동·충돌·상호작용과 저장 좌표의 배치 원본입니다.

## 디자인 기준과 승인

- [현재 2D 배치 원본](../../../godot-arcana/scenes/native_2d/inn_lobby.tscn)은 [지역 레지스트리](../../../godot-arcana/data/regions.json)에서 연결합니다.
- [2D 여관 전경](../../interiors/solid-walls-v1/arcana_inn-overview.png)의 가구와 색을 참조했습니다. 과거 전경에 있던 계단은 현재 배치에 맞춰 제외했습니다.
- 사용자가 시안 제시 후 `ㅇㅇㅇ ㄱㄱㄱ`으로 모델링을 승인했습니다. [승인 시안](source/blender-v1/approved-concept.png)은 실내·야외 타일셋과 아르카나 투영 가이드를 함께 입력한 이미지 생성 결과입니다.
- [월드 제작 기준](../../../docs/roles/WORLD_BUILDING.md)의 정면 45° 정사영을 적용했습니다. 카메라의 좌우 회전은 0°이고 바깥은 검정입니다.

## Blender 원본과 배치

- [Blender 원본](source/blender-v1/inn-lobby.blend) · [정면 검토 렌더](source/blender-v1/inn-lobby.png) · [제작 스크립트](source/blender-v1/build_inn.py)
- 바닥은 폭 15m, 깊이 10.5m의 참나무 판재입니다. Blender의 바닥 높이는 `Z=0`이고 앞쪽 `-Y` 중앙에 문턱이 있습니다. 앞쪽 벽과 문턱은 별도 컬렉션에서 편집합니다.
- 왼쪽에는 석조 벽난로와 책장, 보라색 소파와 찻상을 놓았습니다. 뒷벽의 의뢰 게시판·열쇠 걸이 아래로 접수대와 수납 벤치를 배치했습니다. 중앙 출입구에서 휴식석과 접수대까지 바닥을 비웠습니다.
- 가구·건축·조명을 컬렉션과 이름 있는 오브젝트로 구성했습니다. 시안의 따뜻한 조명은 벽난로와 등불의 실제 광원, 직물과 목재는 Blender 재질로 구현했습니다.
- 모델을 수정할 때는 `.blend`를 편집합니다. 초기 구성을 재생성하려면 Blender 5.3을 별도 백그라운드 프로세스로 실행하고 `--python art-studies/regions/arcana-inn-interior/source/blender-v1/build_inn.py`를 전달합니다. 이 스크립트는 같은 폴더의 `.blend`와 렌더를 다시 생성합니다.

## 확인 범위

Blender 5.3에서 저장한 `.blend`를 다시 열어 정면 카메라와 장면 오브젝트를 확인했습니다. 재개방한 파일로 1440×1080 렌더를 출력해 출입구, 중앙 통로, 양쪽 가구 배치와 조명을 검토했습니다.

## 본편 연결과 화면 확인

- [Godot 3D 씬](../../../godot-arcana/scenes/inn_lobby_3d.tscn) · [GLB](../../../godot-arcana/art/source/inn-lobby-blender/inn-lobby.glb) · [본편 배치 전경](source/blender-v1/inn-lobby-godot.png) · [세로 화면의 소파 자세](source/blender-v1/inn-lobby-seat-godot.png)
- Blender 5.3에서 저장한 원본을 배경 모드로 열고 같은 폴더의 [export_inn.py](source/blender-v1/export_inn.py)를 실행하면 GLB를 재출력합니다. 스크립트는 모디파이어가 적용된 메시와 곡선 장식을 29개 편집 그룹으로 묶고 벽난로 불꽃을 독립 파츠로 내보냅니다.
- [본편 표시 코드](../../../godot-arcana/scripts/inn_lobby_3d.gd)는 소파·안락의자·접수대 등 모델을 2D 충돌 위치에 맞춥니다. 좌석 네 곳, 접수대, 의뢰판과 출구는 기존 ID로 상호작용합니다. 로컬·원격 캐릭터의 발과 좌석 높이를 배치에 맞추고, 환경 효과와 모션 감소 설정을 화로와 실내 조명에 적용합니다.
- 소파·안락의자의 쿠션 테두리 곡선을 천 표면 앞으로 옮기고 폭을 보정해, 게임 화면의 도트 크기에서 선이 이어지게 했습니다. 담요의 두 가장자리도 같은 방식으로 맞췄습니다.
- Godot 4.5.1 Compatibility 뷰포트에서 실제 배치 원본을 불러왔습니다. 720×540 렌더를 최근접 방식으로 2배 확대해 전경을 확인했고, 384×824에서 소파 자세를 확인했습니다. 클릭 대상 7개와 카메라 좌표 왕복을 확인했습니다. Blender 절차 나뭇결은 Godot의 기본 재질색으로 표시됩니다.
- 웹 리소스 선택과 패키지 검사에 3D 로비를 등록했습니다. 로그인한 상태에서의 광장 왕복과 웹 빌드는 실행하지 않았습니다.
