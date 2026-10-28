# 백발 주인공 · Blender에서 만든 8방향 도트

현재 게임/편집기 표시 자산입니다. 원화 후보 2번의 정체성을 유지합니다.
생성 시안은 목표 자료이며 실제 게임 모습은 `godot-arcana/art/reference/heroine-pixel/after.png`입니다.

## 입력과 재제작

프로젝트 루트에서 실행합니다. 기존 프로젝트 포터블 Blender 4.5.15와 설치된 Python/Pillow/NumPy를 사용합니다.

```powershell
pwsh -File scripts/build-heroine-sprites.ps1
pwsh -File scripts/render-godot-pixel3d-art.ps1 -Heroine
powershell -File scripts/build-godot-arcana.ps1
```

- 모델 원형: `../blender/heroine.blend`. 모델 형상 수정은 원형 또는 `scripts/blender/build_heroine.py`에 반영합니다.
- 도트 프로필: `scripts/blender/bake_heroine_sprites.py`. 원형 복사본의 머리 폭, 고개 각도, Action 키와 카메라를 조정합니다.
- `heroine-pixel.blend`는 위 명령이 재생성하는 편집 확인용 사본입니다. 이 파일만 수동 수정한 내용은 다음 재생성에 유지되지 않습니다.
- 얼굴 보정 입력: `face-retouch.json`의 선색·눈색·홍조·입색, 눈의 윗선 폭, 정면/옆면 적용 방향입니다.
- 마무리: `scripts/finish-heroine-sprites.py`의 재질별 3단계 색, 얼굴 뼈대 투영 보정, 1칸 외곽선입니다. 원화를 축소하거나 AI 프레임을 이어붙이지 않습니다.
- `-Preview`는 정면/대각선 마스터 두 장만 생성하고 게임 시트는 교체하지 않습니다. `-FinishOnly`는 기존 `.runtime/heroine-sprites/raw` 렌더에 보정만 다시 적용합니다.

## 출력 규격

64×80칸 / 발 (32,72) / 정면 높이 56칸 / 8방향 S SE E NE N NW W SW.
방향별 대기 4장(2fps), 걷기 8장(이동 거리 주기). 96장을 16열×6행의 1024×480 시트로 저장합니다.
RGBA 원본 텍스처는 1.875MiB이며 mipmap 없음, nearest, 1bit alpha입니다.
프레임 위치는 direction*12 + idle_frame 또는 direction*12 + 4 + walk_frame입니다.

`heroine-sprites.json`은 프레임별 뼈대 투영점·발·경계·시트 위치와 카메라 밀도, 발의 앞뒤 움직임으로 측정한 보폭을 기록합니다.
게임 상수는 `godot-arcana/art/resources/heroine_sprite_spec.gd`로 자동 생성합니다.
`master-*.png`는 각 방향의 첫 대기 프레임, `heroine-directions.png`는 8행 방향 시트,
`bake-preview.png`는 마스터 정면/대각선의 6배 확대, `walk-front.gif`는 자산의 2배 동작 미리보기입니다.

## 게임과 확인 결과

`heroine_sprite.gd`는 기존 `pose(time,gait,walking,motion,pixelated,effects)`를 유지합니다.
이미지 한 평면과 접지 그림자만 그리며, 세계 방향에서 카메라 yaw를 빼고 이미지를 고릅니다.
3D 세계의 발 기준 깊이 규칙을 적용하므로 나무와 건물 뒤에서 가려집니다.
기본 정면뷰, 쿼터뷰 메뉴 유지, 전체 카메라 줌 약 2.02317로 모바일 정면 높이 약 112px를 확보합니다.

실제 시작 장면을 읽은 오프라인 GPU 비교와 방향/주기 검증은
`godot-arcana/art/reference/heroine-pixel/verification.json`에 있습니다.
`before-original.png`는 이전 카메라, `before-matched.png`는 같은 새 카메라에서 기존 모델,
`after.png`는 새 도트입니다. `before-after.png`는 같은 구도의 원래 크기 비교입니다.
FPS/모바일 성능/브라우저 플레이와 최종 미술 승인은 별도 확인 대상입니다.

