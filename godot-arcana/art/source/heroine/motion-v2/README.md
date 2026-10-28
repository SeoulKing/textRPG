# 주인공 동작 v2 · 접지와 전환

기준은 승인된 run-v1 외형입니다. 정지는 새8방향 원화에서 양발로 서는 자세를 제작했습니다. 현재 게임에 함께 추가된 heroine-idle-v1의 호흡/눈깜박임과 시전·벤치 동작은 보존하며, 이동과 정지 전환만 이 프로젝트의 SpriteFrames로 연결합니다.

## 편집 원본과 게임

- `idle-{방향}.png`: 방향별 중립 원본. 준비 원화는 art-studies/arcana-hero/white-bob-heroine/motion-v2/idle-masters.png입니다.
- `pixelpen/`: idle/run/start/stop_left/stop_right ×8방향의 PixelPen 프로젝트. 이전 run-v1 원본은 보존합니다.
- `frames/`: 저장된 각 자세의 PNG.
- `motion.json`: 클립별 프레임 주소와 등록 규격. 96×136, 발(48,116),64px/단위,32색·이진 알파.
- `gait-audit.json`: 지지발·발끝 높이·무릎·발목 좌표. 다리 길이는 같은 자세 계통에서18/16으로 고정합니다.
- `pixel-corrections.json`: 실제 PixelPen 클래스에서 반영한 관절 도트 수정 좌표.
- 게임 자산: art/export/heroine-motion-v2/heroine-motion.png 및 heroine-motion.tres.
- 런타임: scripts/heroine_run.gd. 대기→출발→달리기→착지→지지발에 맞는 정리→대기로 연결합니다. 이동 자체의 속도·충돌·저장은 변경하지 않습니다.

## 제작과 수동 수정

이미지 생성 후보에서 방향이 바뀌거나 같은 발을 반복한 동작 시트는 채택하지 않았습니다. 새중립8방향은 별도로 정리했습니다. 달리기는 승인된 상반신 그림을 보존하고, 뒤 대각선의 잘못된 방향에는 중립 원본을 사용합니다. 다리는 좌우 반주기 차이로 지지/회수하며 투영된 두 관절과 완전한 신발을 사용합니다. 무릎 주변은 설치된 PixelPen의 ProjectPacker/IndexedColorImage로 보정해 저장했습니다. 마우스로 직접 전 프레임을 그렸다는 뜻은 아닙니다.

1. PixelPen에서 수정할 .pxpen을 열어 프레임·팔레트·이전 프레임 겹치기를 사용합니다.
2. 저장 후 `python scripts/sync-heroine-motion-v2.py`로 수동 원본을 읽어 게임 아틀라스를 갱신합니다.
3. 웹 반영에는 Web export가 필요합니다. F6 장면은 scenes/characters/heroine_run_preview.tscn입니다.

`prepare-heroine-idle-v2.py`와 `build-heroine-motion-v2.py`는 최초 제작 레시피입니다. 수동 편집 이후 재실행하면 v2 편집 원본을 재생성하므로 일반 반영에는 sync만 사용합니다. Native PixelPen 보정은 addons/heroine_motion_authoring/refine_heroine_motion.gd에 보존합니다. 실행 프로젝트에는 편집기 애드온을 넣지 않습니다.

미술의 자연스러움은 숫자와 구별합니다. 관절 계산과 프레임 연결은 제작 근거이며, 사용자의 실제 플레이 감상과 미술 승인을 대신하지 않습니다.
