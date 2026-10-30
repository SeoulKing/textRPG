# 달리기 보폭·회수 자세 보정

2026-10-29 사용자의 기존 캐릭터 일관성 유지 및 달리기 개선 요청에 따른 편집본입니다.

- 원본: `reference-bright-v10/pixelpen/`. 기존 원본과 identity-v1 기준 사본은 보존합니다.
- 변경: 8방향 × 8프레임의 다리 자세. 접지, 압축, 밀어내기, 공중 자세와 반대 다리의 회수를 반 주기로 배치했습니다. 치맛단의 실제 색 영역 아래에 다리를 그려 가림을 유지합니다.
- 보존: 얼굴·머리·상체·의상과 공통 팔레트, 96×136 캔버스, 발 기준, 게임 이동 속도. 대기·시전·벤치 PixelPen 파일은 원본 그대로 복사했습니다.
- `pixelpen/`이 실제 편집 원본이며 `native-frames/`는 PixelPen 저장·재열기 후 출력입니다. `preview/side-before-after.png`는 위가 이전, 아래가 수정본입니다. GIF는 편집 타이밍이며 게임 속도 검증 자료가 아닙니다.
- 제작: `godot-arcana/tools/refine_heroine_run.gd`가 설치된 PixelPen API로 인덱스 도트를 수정했습니다. 최초 제작용이므로 수동 편집 후 재실행하지 마십시오. `--revise-draft`는 이번 첫 제작 중 접지와 두께 보정에만 사용했습니다.
- AI 측면 초안은 얼굴·머리 비례가 달라 채택하지 않았습니다. 실제 출력에는 AI 초안 픽셀을 사용하지 않았습니다.

일반 편집 반영: `python scripts/sync-heroine-fullbody.py`. 활성 명세는 상위 `animation-pipeline.json`, 게임 출력은 `art/export/heroine-run-stride-v11/`입니다.

PixelPen 저장·재열기, 내보내기 사전 구조 확인 및 전후 정지 프레임 비교를 수행했습니다. 게임·브라우저 실행과 웹 내보내기는 수행하지 않았습니다. 동작의 자연스러움에 대한 사용자 최종 평가는 아직 받지 않았습니다.
