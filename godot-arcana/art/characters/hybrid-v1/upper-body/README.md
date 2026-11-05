# 하이브리드 버전 1 · 팔·몸통 통합 상체

[사용자 참조](reference.png)의 팔과 몸통을 **방향별 한 장의 연속된 텍스처**로 유지합니다. 크림 셔츠·소매·커프·멜빵·금속을 같은 Polygon2D UV와 가중치로 변형하며 [전신 조립](../assembly/README.md)을 통해 본편에 연결합니다.

## 원본·리그와 등록

- `{방향}/upper_body.pxpen`: 셔츠·가죽·금속·깃 테두리·목 피부·외곽선 재질 레이어. 팔/몸통 이미지로 분리하지 않습니다.
- `{방향}/upper_body.png`: 48×48 합성 원본. 참조에 대한 공통 `42/264` 축척을 사용합니다.
- `upper-body-8dir.png`: 위 S·SE·E·NE / 아래 N·NW·W·SW. `manifest.json`이 팔레트·관절점·원본/출력 해시를 기록합니다.
- [방향별 편집 리그](../rigs/upper-body/s.tscn): 같은 폴더의8방향 `.tscn`. 저장된 정점·UV·Bone2D 가중치가 편집 원본입니다.
- [상체 작업실](../../../../scenes/characters/hybrid-v1/upper-body-workbench.tscn): 중립·달리기0/25/50/75%, `show_mesh` 격자 비교.

상체당 Polygon2D1개·Skeleton2D1개·몸통과 좌우 상완/전완 Bone2D5개를 사용합니다. 2px 간격 격자 정점의 가중치를 변형하고 UV는 텍스처에 고정합니다. [공통3D 동작](../shared-run.json)의 중립 대비 투영 이동을 새 상체 비례에 맞춰 전달합니다. 본편에서도 같은 조립기를 사용하며 과거 긴 관절 길이에 그림을 늘이지 않습니다.

원본 그림의 외곽선을 표시 단계에서 중복하지 않습니다. 허리 벨트는 [골반](../pelvis/README.md)이 소유합니다. 상체 원본은 벨트를 보존하고 본편은 `assembly/upper-body-assembly/`의 중복 벨트만 가린 조립용 단일 텍스처를 사용합니다. 팔·소매·커프는 분리하거나 지우지 않습니다.

## PixelPen 수정·출력

```text
--headless --path godot-arcana --script res://tools/characters/hybrid_v1/author_reference_upper_body.gd -- --export
```

PixelPen 저장→재열기→PNG 출력 후 조립 사본 갱신은 `res://tools/characters/hybrid_v1/prepare_reference_assembly_textures.gd`를 사용합니다. PNG 갱신과 메시 재생성을 구별하고 **수동 UV·가중치를 보존**합니다. 기존 리그 빌더를 실행해 편집본을 덮어쓰지 않습니다.

작업실 SubViewport에서만 Bone2D 하위 트리의 편집 표시를 숨겨 회색 가이드가 출력에 섞이지 않게 합니다. 형제 Polygon2D의 스키닝과 저장된 리그의 뼈 표시는 유지합니다. 극단적인 팔 굽힘의 픽셀 뭉침·손 가림은 후속 시각 검수 대상입니다. 기준은 [캐릭터 아트 담당](../../../../../docs/roles/CHARACTER_ART.md), 확인 상태는 [인계](../assembly/CURRENT_STATUS.md)를 따릅니다.
