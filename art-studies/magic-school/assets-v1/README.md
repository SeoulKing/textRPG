# 마법학교 · 정면 2D v1

현재 상태: **게임 연결·웹 내보내기·오프라인 GPU 렌더 완료 / 사용자 미술·플레이 확인 전**.

## 기준과 제작
- 디자인 참조: [승인 컨셉](../arcana-magic-school-concept-v1.png).
- 내장 image_gen으로 독립 건물을 새로 생성했습니다. 생성 원본은 academy-source.png, 전체 프롬프트는 academy-prompt.txt입니다.
- 정면, 좌우 회전 0도. 기존 게임의 카메라 기본값과 전환 기능은 변경하지 않았습니다.
- 1280×1152 PNG, 실제 실루엣 1216×1008, 정문 앞 기준점 (640,1088), 64px/월드 단위. 캐릭터는 기존 약 110px 그대로입니다.
- 기존 월드 64색 원본을 LUT 고정점으로 변환한 팔레트를 사용합니다. 실제 사용색 63개, 알파 0/255, 최근접 표시, 밉맵 없음, 손실 없는 압축입니다.
- 게임용 PNG: godot-arcana/art/export/reference/academy-2d.png. 동일 파일을 academy-building.png로 보관합니다.
- scale-overview.png와 entrance-detail.png는 실제 현재 주인공의 남향 대기 프레임을 합성한 제작 비교판입니다.

## 배치
- plaza.tscn의 마법학교_2D 노드, model_kind=academy-2d, 위치 (12,0,9.5).
- 로컬 충돌 Rect2(-8.5,-4,17,4), 정문 앞은 통과 가능합니다.
- 기존 북쪽 길과 이어지는 두 포장 영역을 추가했습니다. 기존 노드 131개는 그대로 유지했습니다.
- 기존 academy/arcana_academy는 별도 3D 학교로 유지합니다. 새 건물은 게임플레이 ID가 없는 외관·충돌 객체이며 실내나 입장 선택지가 없습니다.
- 큰 빌보드의 표시 경계는 실제 이미지 크기를 포함합니다. 그림자는 지면의 기존 셰이더로 만들며 새 건물 뒤쪽으로 접지시켰습니다.

## 재제작과 확인
기존 Node/Sharp 환경에서 scripts/build-magic-school-art.cjs를 실행하면 PNG와 비교판을 다시 만듭니다.
scripts/build-godot-arcana.ps1은 가져오기와 웹 내보내기, scripts/render-magic-school.ps1은 실제 main.tscn/Plaza를 사용하는 오프라인 GPU 렌더입니다. 두 PowerShell 스크립트는 pwsh로 실행합니다.

렌더와 inspection.json: godot-arcana/art/reference/magic-school/.
- school-overview-front.png: 정면 전체. 전체 검토를 위해 이 렌더에서만 카메라를 축소하고 위로 옮겼습니다.
- school-entrance-front.png: 기본 배율의 정문·캐릭터.
- school-behind-front.png: 건물 뒤 캐릭터 가림.
- school-default-camera.png: 변경하지 않은 기본 쿼터뷰에서의 표시.
- original-3d-school.png: 보존된 기존 3D 학교.

직접 확인: 게임 새로고침 → 북쪽 귀환 포탈 → 왼쪽/서북쪽 접근로 → 정문 앞 이동 → 건물 옆과 뒤 지나가기.
정면 비교는 메뉴의 정면 시점 전환을 사용하시면 됩니다.
브라우저 조작·플레이·모바일 성능 측정은 수행하지 않았습니다.

현재 게임은 ../assets-v2/의 3/4 RPG 재제작본을 사용합니다. 이 폴더는 이전 정면 입면도 제작본입니다.
