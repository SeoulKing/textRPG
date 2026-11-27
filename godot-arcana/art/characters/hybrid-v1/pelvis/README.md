# 하이브리드 버전 1 · 8방향 골반

[사용자 참조](reference.png)의 갈색 가죽 벨트·치마판, 크림 안감, 붉은 천, 금속 버클·별 장식을 보존합니다. 방향 글자·선택 흔적은 그림에 넣지 않습니다. [전신 조립](../assembly/README.md)의 확정 의상으로 본편에 연결합니다.

## 파일과 등록

- `{방향}/pelvis.pxpen`, `pelvis.png`: PixelPen 원본과 재열기 후 합성 PNG.
- `leather.png`, `lining.png`, `tabard.png`, `metal.png`, `silhouette.png`: 보이는 재질 레이어 출력.
- `pelvis-8dir.png`: 48×48 셀4열×2행. 입력 왼쪽부터 SW·W·NW·N·NE·E·SE·S를 위4/아래4로 배치합니다.
- `manifest.json`: 팔레트·연결점·불투명 경계·원본/출력 해시. 밝고 어두운 배경의6배 최근접 미리보기를 함께 둡니다.

캔버스는 **48×48**, 입력 전체에 공통0.12배 격자를 적용합니다. 윗면 중심축 x=24·최상단 y=5, **허리 피벗(24,9)**입니다. 방향별 불투명 폭·높이는 manifest의 실측값을 따르며 같은 폭으로 늘이지 않습니다. 후면의 금색 별은 참조의 일부로 보존합니다.

등록 팔레트는 불투명18색+투명1칸이며 실제 사용색은 별도 측정합니다. 알파는0/255, 한 잉크색 외곽선이 PNG에 이미 있으므로 표시 단계에서 추가하지 않습니다. 가려진 신체·다리를 재질 레이어에 임의로 그려 넣지 않습니다. 최종 허리 벨트는 골반이 한 번만 소유하며 상체 조립 사본에서 중복 벨트를 가립니다.

## PixelPen 출력

```text
--headless --path godot-arcana --script res://tools/characters/hybrid_v1/author_reference_pelvis.gd -- --export
```

`.pxpen` 편집·저장→재열기→PNG 출력으로 갱신합니다. `--export`는 저장된 그림을 재생성하지 않습니다. 공통 팔레트·캔버스와 수동 원본을 유지하고 PNG만 수정하지 않습니다. 저장/출력 기록과 실제 게임 검수는 구분합니다. 기준은 [캐릭터 아트 담당](../../../../../docs/roles/CHARACTER_ART.md), 현재 확인 범위는 [인계](../assembly/CURRENT_STATUS.md)를 따릅니다.
