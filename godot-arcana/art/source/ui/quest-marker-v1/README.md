# 퀘스트 물음표 · 승인 시안 v1

- 사용자 승인: 2026-10-29 금빛 도트 물음표, 짙은 갈색 한 픽셀 외곽선, 머리 위 간격. PixelPen 에셋 사용 요청.
- 편집 원본: `quest-question.pxpen`. PixelPen native API의 `set_index_on_color_map`으로 개별 픽셀을 찍어 저장했습니다. UI 브러시 수동 조작으로 제작한 것은 아닙니다.
- 게임용 출력: `../../../export/ui/quest-question.png`. 20×26 RGBA, 투명 배경, 불투명 4색, 무밉맵·최근접, 64px/월드 단위.
- 재제작: `tools/author_quest_marker.gd`. PixelPen 저장본을 다시 열어 PNG를 내보냅니다. 수동 수정 후에는 제작 스크립트를 재실행해 덮어쓰지 마십시오.
- 승인 컨셉: `approved-concept.png`. 확대 확인용 `preview.png`는 게임에 연결하지 않습니다.
- 표시기: `scripts/quest_marker.gd`의 Sprite3D. NPC 발 기준에서 화면 위 137px, 그림 하단과 머리 사이 약 8px. 빌보드·조명 영향 없음·그림자 없음.
- 마르텐: 서버가 실제 제공하는 의뢰가 있을 때만 표시합니다. 미수락 `?`, 10마리 처치 후 보고 가능 `!`, 진행 중·보상 수령 후 숨김.
- 완료 느낌표: `quest-complete.pxpen` → `../../../export/ui/quest-complete.png`, `tools/author_quest_complete.gd`로 PixelPen 개별 픽셀 제작·저장본 재읽기·내보내기. 물음표와 같은 20×26 규격과 팔레트입니다.
- PixelPen 저장/재읽기/PNG 내보내기 완료. 게임 실행과 웹 빌드 검증은 별도입니다.
