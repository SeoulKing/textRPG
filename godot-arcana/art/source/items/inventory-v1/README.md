# 소지품 아이템 썸네일

2026-11-02 사용자가 컨셉과 64×64 제작을 승인했습니다. 기준 그림은 `art-studies/item-thumbnails-v1/concept-v1.png`입니다.

- 민물고기: 은청록색 비늘, 위쪽 오른편을 향한 머리와 아래쪽 왼편 꼬리.
- 생선구이: 같은 물고기의 황금갈색 구운 표면과 세 개의 칼집.
- 목재: 밝은 나이테와 짙은 껍질이 보이는 원목 세 토막.

공통 규격은 루트 `ARCANA_ART_GUIDE.md`의 아이템 썸네일 항목을 따릅니다. 각 `.pxpen`이 편집 원본이며 `.json`은 재열기 후 기록한 팔레트·64행 픽셀 사본입니다. `scripts/author-item-thumbnails.ps1`은 기존 원본을 보존해 PixelPen에서 재열고 게임 PNG와 `preview.png`를 출력합니다. 비교 그림은 위쪽 3배 확대, 아래쪽 실제 64·40픽셀을 사용합니다. 승인 시안의 윤곽을 셀 투표로 옮긴 뒤 소재별 제한 팔레트와 고립 도트 제거를 적용했습니다.

아이템 ID 연결: `riverFish` → `river-fish.png`, `grilledFish` 및 Fine/Excellent → `grilled-fish.png`, `wood` → `wood.png`.
