# 대시 · 승인 시안과 편집 원본

준비 동작 없이 입력 즉시 진행 방향으로 대시합니다. 이동 입력이 없으면 클릭 경로의 방향, 그마저 없으면 마지막 이동 방향을 사용합니다. 기본 2번 퀵슬롯의 `dodge` ID를 유지합니다.

- 승인 시안: `approved-concept.png` (2026-10-28 사용자 승인).
- 외형 기준: `../reference-bright-v10/pixelpen/`. 기존 캐릭터는 변경하지 않습니다.
- 편집 원본: `pixelpen/dash_{s,se,e,ne,n,nw,w,sw}.pxpen`. 실제 PixelPen 1.1.4 API로 48프레임의 색 인덱스를 수정·저장·재열기했습니다. `plans/native-result.json`은 그 결과입니다.
- 새 자세는 같은 방향의 원본 달리기 전신에서 전진 기울기·낮아진 자세와 내부 틈을 보정하고 마지막은 원본 대기 자세로 연결합니다. 얼굴/팔레트/의상을 새로 디자인하지 않습니다. 방향마다 몸·머리·의상이 함께 움직입니다.
- 규격: 96×136, 발 (48,116), 32색, 64px/월드 단위. 방향당 6프레임, 40/40/40/60/40/60ms. 원본 알파는 이진입니다.
- 이동: 28좌표(1.75칸)를 .18초에 이동, 전체 자세 .28초, 회피 .3초, MP 0, 재사용 5초. 벽 앞에서는 충돌 경로까지만 이동하며 개발 가속은 대시 거리를 늘리지 않습니다.
- 게임 자산: `art/export/heroine-dash-v1/heroine-dash.png`, `art/export/spells/dash.png`. 잔상은 저장된 대시 프레임에 청백색과 반투명을 적용합니다. 효과 끄기/모션 감소에서 잔상을 숨겨도 이동·회피 판정은 유지됩니다.

수동 PixelPen 편집 후 반영: `python scripts/author-heroine-dash.py --sync`.
최초 제작용 `scripts/author-heroine-dash.py`의 계획 생성과 `tools/patch_heroine_dash.gd`는 수동 저장 뒤 다시 적용하지 않습니다. 계획 재적용은 원본 기준을 다시 확인하여 의도적으로 재제작할 때만 수행합니다.

`native-frames/`는 실제 PixelPen PNG 출력이며 `--sync`는 저장된 `.pxpen`을 읽어 패키징합니다. 애니메이션 미리보기는 `preview/dash-eight-directions.gif`입니다. 사용자 게임/브라우저의 조작 검증과 별개입니다.
