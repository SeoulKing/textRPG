# 하이브리드 버전 1 · 8방향 머리

[사용자 참조](reference.png)를 같은 격자와 팔레트로 옮긴 확정 머리입니다. 흰빛 연보라 단발·보라 눈·앞머리 가림을 유지하며 [전신 조립](../assembly/README.md)을 통해 본편에 연결합니다.

## 파일과 등록

- `{방향}/head.pxpen`: PixelPen 편집 원본.
- `{방향}/head.png`: 얼굴·머리카락·외곽선을 합친 투명 PNG.
- `hair_visible.png`, `face_visible.png`, `silhouette.png`: 같은 원본의 보이는 레이어 출력.
- `heads-8dir.png`: 48×48 셀 4열×2행. 위 NW·N·NE·W / 아래 SW·S·SE·E.
- `manifest.json`: 방향·연결점·팔레트·해시·재열기/출력 기록. `preview-light.png`, `preview-dark.png`는 6배 최근접 비교.

개별 캔버스는 **48×48**, 머리 높이는 약41~42px입니다. 목 연결점 **(24,44)**, 꼭대기 y=3을 사용합니다. 방향별 폭은 투영에 맞게 다르며 억지로 통일하지 않습니다. 등록 팔레트는 불투명21색+투명1칸이고 실제 사용량은 manifest의 측정값과 구별합니다.

알파는0/255이며 외곽선은 한 잉크색 `silhouette` 레이어에 이미 들어 있습니다. 표시 단계에서 다시 선을 추가하지 않습니다. 검은 눈썹·속눈썹·동공을 배경으로 지우지 않습니다. 레이어는 **보이는 영역의 분리**이며 가려진 얼굴·뒤머리까지 복원한 교체 시스템이 아닙니다. 완전 후면 N의 `face_visible`이 비어 있는 것은 정상입니다.

## PixelPen 출력

원본의 `hair_visible`·`face_visible`·`silhouette`를 편집·저장한 뒤 재열기·PNG 출력합니다. 저장소 루트에서 Godot 실행 파일에 다음 인자를 전달합니다.

```text
--headless --path godot-arcana --script res://tools/characters/hybrid_v1/author_reference_head_parts.gd -- --export
```

`--export`는 저장본을 읽으며 그림을 다시 생성하지 않습니다. 공통 크기·팔레트·연결점과 수동 원본을 보존합니다. PNG만 수정하면 다음 출력에서 사라집니다. 출력 기록은 파일 저장 증거이며 본편 이동 검수와 다릅니다.

공통 마감·일관성 기준은 [캐릭터 아트 담당](../../../../../docs/roles/CHARACTER_ART.md), 현재 게임 확인 범위는 [인계](../assembly/CURRENT_STATUS.md)를 따릅니다.
