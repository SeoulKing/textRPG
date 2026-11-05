# 현재 제작: 공통 Godot 2D 스켈레톤

최신 주인공 제작은 Godot Skeleton2D·Bone2D·Polygon2D·AnimationPlayer에서 같은 포즈의 모든 레이어를 출력하고 도트를 보정하는 방식입니다. 이전 제작기록보다 [현재 원본·편집 안내](../../godot-arcana/art/source/heroine/README.md)를 우선합니다. 기존288장 주소와24자세 보행을 유지하고 정지 회전64장을 추가한352프레임·16×22아틀라스입니다. 서로 다른 방향의 신체를 가로선으로 나누어 합치는 방식은 폐기했습니다.

- 새 원본/원본 보강 기록: godot-arcana/art/source/heroine/skeletal/
- 실제 native 편집 장면: 같은 폴더 scenes/rig-s.tscn 등8방향
- 이전 자료: before-skeleton/ 및 previous-natural-walk/
- 실제 게임 출력·검사: godot-arcana/art/reference/natural-walk/
- 재출력: pwsh -File scripts/rebuild-heroine-skeleton.ps1

---

## 이전 제작 기록

# 아르카나 · 편집 가능한 주인공과 거리 기반 보행

사용자가 지정한 **현재 인게임 나무의 도트 품질**을 캐릭터에도 적용한 구현입니다.
백발 단발 후보 2번의 정체성을 유지하며 최종 미술 승인과 실제 브라우저 플레이는 별도입니다.

## 결과와 재제작

- [최대 3칸/초 보행과 정지 · 실제 게임 GPU 렌더](../../godot-arcana/art/reference/natural-walk/full-walk-stop.gif)
- [느린 걸음과 정지](../../godot-arcana/art/reference/natural-walk/slow-walk-stop.gif)
- [24자세 시트](../../godot-arcana/art/reference/natural-walk/after-walk.png)
- [이전/현재 정면·측면 자세](../../godot-arcana/art/reference/natural-walk/before-after-poses.png)
- [프레임·가림·팔레트 확인](../../godot-arcana/art/reference/natural-walk/verification.json)
- [도트 편집 원본과 안내](../../godot-arcana/art/source/heroine/README.md)

```powershell
node scripts/build-arcana-reference-art.cjs --hero-only
pwsh -File scripts/build-godot-arcana.ps1
pwsh -File scripts/render-arcana-reference.ps1 -NaturalWalk
python scripts/validate-character-quality.py
```

기존 Node/Sharp, Python/Pillow/NumPy, Godot 도구만 사용합니다.
`--hero-only`는 캐릭터만 갱신하며 기존 나무·지면·소품을 재생성하지 않습니다.
전체 미술을 재생성할 때만 이 옵션을 생략합니다.
인물 전후 비교는 같은 카메라 확대율·같은 인물 방향이며 배경 위치는 다릅니다.
사용자의 다른 작업에서 추가한 높이 기준 상자가 시작 위치를 가려, 새 보행 확인은 남쪽 돌길에서 수행했습니다.
상자나 Plaza 배치를 제거하지 않았습니다. GIF의 배경은 실제 한 주기 이동 후 정지를 반복하므로 끝에서 시작 지점으로 돌아옵니다.

## 원본·도트 규격

- 초기 원화: `source/hero-cardinal-clusters-v2.png`, `source/hero-diagonal-clusters-v2.png`. 이전 원본은 보존합니다. 현재 공통 편집 원본은 godot-arcana/art/source/heroine/masters/이며 프레임 좌표 수정은 workshop.json입니다.
- 96×136칸, 발 (48,116), 인물 높이 약 110칸, 공통 **64칸/단위**입니다.
  프레임 아래 8칸 추가는 앞으로 뻗는 발의 여백이며 인물이나 픽셀을 확대하지 않습니다.
- S·SE·E·NE·N·NW·W·SW, 방향별 대기 4+걷기 24+좌/우 정지 각 4=36장, 총 288프레임입니다.
  아틀라스는 16열×18행, 1536×2448입니다.
- 백발의 따뜻한 하이라이트를 피부로 오판해 지우지 않습니다. 머리는 회백색의 제한된 색,
  얼굴은 피부/보랏빛 눈, 의상은 하늘색 숄/상아색 드레스/남색 리본으로 구분합니다.
  재질에 맞는 색 묶음과 정리된 픽셀 덩어리를 사용합니다.
- 최근접, 이진 알파, 공통 월드 LUT 고정색, 밉맵 없음, 손실 없는 압축을 유지합니다.
  나무·분수·배경·공통 팔레트를 바꾸어 캐릭터 품질을 맞추지 않습니다.

## 보행

이동 최대 속도는 초당 3칸(내부 좌표 48)입니다. 실제 이동 거리 20좌표=1.25칸마다 24개 자세를 순환하므로 최대 속도에서는 두 걸음 주기 약 0.417초입니다. 작은 조이스틱 입력에서는 실제 이동과 보행이 함께 느려집니다.

heroine-pixel-motion.cjs는 지지 구간 60%, 양발 지지 총 20%, 발 들기, 무릎의 구간별 변형, 팔의 반대 움직임, 머리·옷의 지연 움직임을 만듭니다. 정지 시 가까운 통과 자세로 연결하고 발을 내려 0.16초 동안 정착합니다. 게임 시간으로 일시정지를 따르며 방향/줌/옷 교체는 걷는 위상을 초기화하지 않습니다.

pose(time,gait,walking,motion,pixelated,effects) 계약은 유지합니다. 네이티브 heroine_frames.tres의 프레임 순서·상대 지속시간도 게임에서 사용하며 수동 편집을 보존합니다.

## 의상·가림

몸·머리·드레스·숄·두 신발·블라우스·치마의 방향별 마스터는 `masters/`,
게임 아틀라스는 `godot-arcana/art/export/reference/hero-*.png`,
등록과 프레임 명세는 `manifest.json`, 생성 상수는 `heroine_reference_spec.gd`입니다.

`set_outfit(PackedStringArray)`는 드레스와 상의/하의의 점유 충돌을 검사합니다.
네 가림 마스크는 `hero-occlusion.png`의 R=드레스/G=상의/B=하의/A=신발로 묶습니다.
마스크는 색 공간 변환 없이 샘플링하며 원래의 개별 마스크와 정확히 같은지 확인합니다.
외형·가림 9개 아틀라스의 압축 전 크기는 약 129.1MiB입니다.
정지 자세 추가에 따른 메모리 증가 비용이며 모바일 FPS 향상으로 해석하지 않습니다.

## 확인 범위

288프레임·8방향 각각 24개 고유 보행 자세·잘림 없음·이진 알파·공통 팔레트,
가림 채널과 개별 마스크 일치·끊어진 정강이/신발 조각 없음을 확인합니다. 과거 보호 해시는 보존하되, 별도 작업에서 변경한 벤치·모델·Plaza를 이전 스냅샷으로 덮어쓰지 않습니다. 이번 작업은 캐릭터만 재출력합니다. 실제 시작 장면을 읽은 오프라인 Compatibility GPU 렌더로
나무 옆 배율·원피스·상의/하의 조합·24개 보행 자세를 확인합니다.
브라우저/모바일 조작과 체감 성능은 사용자 확인 항목입니다.

이전 품질 비교는 character-tree-quality/에, 기존 v1 GPU 자료는 `art/reference/reference-scene/`에 보존합니다.

