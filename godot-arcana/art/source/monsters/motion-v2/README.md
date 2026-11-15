# 슬라임 동작 보정 v2

현재 편집 원본은 동작별 `.pxpen` 6개입니다. 규격·사용법은 [상위 안내](../README.md#픽셀-고정과-선-정리--2026-10-30)를 따릅니다.

- `original.pixel.json`, `original-atlas.png`: 작업 전 원본, 재생성으로 덮어쓰지 않습니다.
- `author-plan.json`: 최초 포즈 보정 계획이며 현재 수동 편집 원본이 아닙니다.
- `native-frames/`: PixelPen 저장본을 다시 열어 출력한 120 PNG.
- `pixelpen-audit.json`: 실제 PixelPen 수정·저장·출력 근거.
- `pwsh -File scripts/author-slime-motion.ps1`: 저장한 PixelPen을 JSON/아틀라스/조명 리소스로 출력합니다. 게임/브라우저를 실행하지 않습니다.

대기 중 하단 고정, 원래 모양의 눈/입, 한 픽셀 외곽선, 분리된 꼭지 움직임, 동작 사이의 동일 중립 자세를 보정했습니다. 원본 픽셀 크기와 최근접 확대본은 `art/reference/slime/`에 있습니다. 최종 미술 평가는 사용자 확인 대상입니다.
