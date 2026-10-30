# Blender 주인공 v3

승인된 백발 단발 후보2와 heroine-pixel-gameplay-target-v1.png를 기준으로 제작한 새 3D 원본입니다. 이전 Blender·2D 원본은 보존합니다. 외형과 동작은 실제 렌더를 보고 계속 다듬을 수 있으며, 사용자 미술 승인을 대신하지 않습니다.

## 원본과 표시

- heroine-v3.blend: 27개 뼈(변형23 + 발목/무릎 제어4), 공통 스킨, 8개 의상/몸/머리 메시. 텍스처는 파일에 패킹합니다. 기본 의상을 표시하고 대체 의상은 편집기에서 숨깁니다.
- 게임 GLB: godot-arcana/art/models/heroine-v3/heroine-v3.glb. Blender의 IK 제약은 변형 뼈의 키로 베이크하며, Godot에서 다시 다리를 늘이는 계산을 하지 않습니다.
- 실제 표시는 heroine_blender.gd의 기준96×136 아래에 투명 여백8픽셀을 더한96×144 SubViewport에서 3D 모델을 매 프레임 렌더한 뒤 최근접 도트로 합성합니다. 발 기준(48,116), 64px/단위, 정면45도 카메라와 기존 발 깊이 정렬을 유지합니다. 방향 이미지나 머리/몸통/다리 프레임을 조합하지 않습니다.
- 얼굴·백발·하늘색 숄·상아색 드레스·남색 리본·짙은 스타킹·회갈색 부츠를 기준으로 삼습니다. 외곽선은 출력 실루엣에 한 번만 적용하며, 손·부츠·눈에 각각 검은 외곽 메시를 중복하지 않습니다.

## 리그와 보행

Idle, Walk, Run, TurnLeft, TurnRight가 편집 가능한 Blender Action입니다. 무릎 앞쪽 폴과 발목 IK 목표점, 발 회전 제어를 제공하며 IK stretch는 끕니다. 위팔·아래팔·손, 허벅지·정강이·발을 이어 움직입니다. 머리카락·리본·치마는 보조 뼈에 작은 지연 움직임을 줍니다. 실시간 천 시뮬레이션은 사용하지 않습니다.

걷기 주기 이동은1.04월드 단위, 빠른 이동은1.60입니다. 게임 이동량에 맞춰 위상을 선택하며1.3~3칸/초에서 Walk/Run을 섞습니다. 이동 자체의 최대 속도3칸/초는 바꾸지 않습니다. 멈출 때는 가까운 다음 다리 통과 자세로 진행하며0.18초 안에 착지/대기로 연결합니다. 회전 중에는 보행 위상을 유지하고 고개·상체에 작은 선행 회전을 더합니다.

드레스/치마 안쪽의 상단 스타킹 면은 Stockings_covered로 표시해 착용 중에만 가립니다. 전체 다리 메시와 웨이트는 원본과 GLB에 남고, 벗으면 다시 표시합니다. Blender 원본의 Mask modifier는 착용 미리보기 전용이며 이를 끄면 전체 몸체를 편집할 수 있습니다.

드레스는 상/하의 슬롯을 함께 차지하며 블라우스·치마·숄·두 신발도 같은 뼈대를 사용합니다. pose(), set_camera_yaw(), set_outfit(), 비교 렌더 인터페이스는 유지하고 저장/장비 능력치는 변경하지 않습니다. 새 셀 재질은 실제3D 표면 위치와 법선으로 기존 주변 조명을 받습니다.

## 직접 편집과 재출력

1. heroine-v3.blend에서 메시, 버텍스 그룹, Pose Mode의 CTRL_foot/CTRL_knee와 Action을 편집하고 저장합니다. 색은 Material의 Viewport Display Color, 기존 채색은 패킹된 _paint 이미지를 편집합니다. uses_paint=false 재질은 단색을 사용합니다.
2. `pwsh -File scripts/build-blender-heroine-v3.ps1 -ExportEditedSource`로 저장된 원본을 읽어 GLB를 갱신합니다. 이 명령은 원본 .blend를 덮어쓰지 않습니다.
3. `pwsh -File scripts/render-blender-heroine-v3.ps1`은 저장된 원본을 읽어 보행/회전 미술 출력과 관절 정보를 갱신합니다.
4. Godot의 scenes/characters/heroine_blender_preview.tscn을 F6으로 열면 서버/저장 데이터 없이 속도와 회전, 도트 표시를 확인할 수 있습니다. show_real_3d_mesh는 원래3D 메시 비교용입니다.

초기 생성기를 다시 실행하려면 -RebuildFromRecipe를 명시해야 합니다. 이 명령은 생성 레시피에서 원본을 다시 만들므로 수동 편집 후 일반 재출력에는 사용하지 않습니다. 기존 2D 도트 작업실/원본도 그대로 남습니다.

## 검수와 산출물

rig-audit.json은 Blender에서 실제로 평가한 뼈 길이·목표점 오차·부츠 바닥 높이를 기록합니다. Godot 가져오기 후의 실제 보행 위상과 뼈 길이도 별도로 검사합니다. 원본 크기·확대 보행판, Blender 보행/회전 GIF와 실제 게임 GPU 보행/회전 GIF를 구별해 저장합니다. 브라우저 플레이나 사용자 미술 승인은 이 검사에 포함하지 않습니다.

최종 실제 렌더·웹 반영 상태는 PRODUCTION.md의 Blender v3 항목과 이 폴더 verification.json을 따릅니다.
