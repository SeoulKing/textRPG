# 하이브리드 버전 1 · 확정 캐릭터

2026-11-05 사용자 지시로 현재 외형을 최종 확정했습니다. **가느다란 3등신·96×136 전신 기준**, 흰빛 연보라 단발·보라 눈·크림 셔츠·갈색 가죽·붉은 골반 장식·크림 커프 부츠를 유지합니다. 이 폴더가 본편과 제작실이 함께 사용하는 단일 편집 원본입니다.

## 원본과 등록

| 대상 | 편집·등록 설명 |
| --- | --- |
| 머리 | [heads](heads/README.md): 8방향 PixelPen·레이어 PNG, 목 피벗 |
| 팔·몸통 통합 상체 | [upper-body](upper-body/README.md): 한 장의 Polygon2D, 5개 Bone2D |
| 골반 | [pelvis](pelvis/README.md): 벨트·가죽·안감·붉은 천·금속 |
| 전체 다리 | [legs](legs/README.md): 첨부 원본 RGBA를 보존한 한 장, 두 뼈로 변형 |
| 한 발짜리 신발 | [boots](boots/README.md): 발목·커프·밑창, E는 W의 정확한 반전 |
| 작은 손 | [hands](hands/README.md): 양손 PixelPen 원본·출력·피벗 |
| 전신 조립 | [assembly](assembly/README.md): 파츠 색인·조립 비례·동작 보정 |

기계 명세는 [parts.json](assembly/parts.json), [assembly.json](assembly/assembly.json), [motion-polish.json](assembly/motion-polish.json)입니다. [run-keyframes.tres](run-keyframes.tres)가 달리기 키 원본이며, [shared-run.json](shared-run.json)은 중립 자세·관절 등록을 유지합니다. 실제 16관절 Skeleton3D가 같은 키를 8방향에 적용합니다. `rigs/upper-body/`와 `rigs/legs/`의 방향별 `.tscn`은 수동 UV·가중치 편집 원본입니다.

48×48은 파츠의 논리 등록 캔버스입니다. 투명 여백까지 그림 크기로 취급하거나 모든 방향을 같은 폭으로 늘이지 않습니다. 전체 다리는 고해상도 원본 텍스처를 그대로 유지하고 메시/UV로 논리 좌표에 표시합니다. 자세한 제작 규칙은 [캐릭터 아트 담당](../../../../docs/roles/CHARACTER_ART.md)에 한 번만 둡니다.

## 본편과 제작실

본편 진입점은 [native_2d_hero.gd](../../../scripts/native_2d_hero.gd), 구현은 [native_actor.gd](../../../scripts/characters/hybrid_v1/native_actor.gd)입니다. 주인공 표시를 이 묶음에 연결했으며 과거 캐릭터 시트로 외형을 되돌리지 않습니다.

- [달리기 키프레임 편집](../../../scenes/characters/hybrid-v1/run-keyframes.tscn): AnimationPlayer의 `run`을 고친 뒤 키 기록 → Ctrl+S. [수정·저장 순서](../../../../docs/roles/CHARACTER_ART.md#달리기-키프레임-수정과-저장).
- [이동 실험](../../../scenes/characters/hybrid-v1/experiment.tscn): WASD/방향키·Shift, 동작 보정 비교.
- [전신 비교](../../../scenes/characters/hybrid-v1/workbench.tscn): 중립·달리기 위상·8방향·관절 확인.
- [상체 작업실](../../../scenes/characters/hybrid-v1/upper-body-workbench.tscn), [다리 작업실](../../../scenes/characters/hybrid-v1/leg-workbench.tscn): 저장된 메시와 가중치 편집.

[현재 상태와 남은 확인](assembly/CURRENT_STATUS.md)을 확인하고 시작합니다. 본편은 Godot 4.5.1 GPU에서 서버 입장·8방향 이동·정지를 확인했고, 최신 웹 빌드의 실제 브라우저 입장·표시·이동도 확인했습니다. 모션의 미술 마감과 모든 상호작용의 플레이 검수는 구분합니다. 기존 `review/` 이미지는 이관 전 제작 자료입니다.

시전·앉기·낚시 등의 기존 게임 계약은 같은 확정 캐릭터에 절차 포즈로 연결합니다. 각각의 완성된 전용 애니메이션 클립이 제작된 상태는 아닙니다. 구 캐릭터의 생성 출력·편집 원본 복구 보관본·이전 독립 작업실은 사용자의 영구 삭제 승인에 따라 정리했습니다. 현재 버전의 편집 원본은 이 묶음에 보존합니다.
