# MYSTIC 낚싯대 아이템 썸네일

사용자가 선택한 fishing-v3-shoulder 3번 디자인을 기존 화풍의 64×64 아이템 그림으로 제작했습니다. 새 컨셉 선택 없이 승인된 소재·색·장식을 유지했습니다.

- 원본: fishing-rod.pxpen. PixelPen 인덱스 레이어에서 테이퍼, 남색 감기, 금속 고리, 청금 보석, 파랑/상아색 찌를 편집하고 저장·재열기 후 출력했습니다.
- 픽셀 사본: fishing-rod.json (팔레트·64행·투명 여백 8px).
- 게임 출력: godot-arcana/art/export/items/fishing-rod.png.
- 도구: godot-arcana/tools/author_rod_thumbnail.gd. 기존 PixelPen 파일이 있으면 보존하고 다시 읽어 출력합니다. PixelPen 설정·로그는 기존 제작 도구처럼 작업 폴더 안의 .runtime/godot/rod-thumbnail을 사용합니다.
- preview.png: 밝은/어두운 배경의 2배 비교이며 실제 소지품 화면 촬영이 아닙니다.
- 연결 원본: src/game/data/arcana-item-assets.json의 fishingRod 항목. 소지품과 장비 탭은 DB 아이템 마스터의 thumbnail을 읽습니다.
