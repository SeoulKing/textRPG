# 승인 시트 · 8방향 달리기

- 원본: art-studies/arcana-hero/white-bob-heroine/pixel-run-v1/run-sheet-draft.png
- 런타임: scripts/heroine_run.gd → art/export/heroine-run-v1/heroine-run.png
- 시트: 96×136 셀, 8열×9행. 앞8행 달리기, 마지막 행 방향별 정지. 발 (48,116),64px/단위.
- 순서: S, SE, E, NE, N, NW, W, SW. 8자세/방향. 실제 이동20내부좌표당 한 주기.
- 시트 제작/등록 정보: registration.json. 재패키징: python scripts/package-heroine-run.py.
- PixelPen: pixelpen/run-s.pxpen 등 방향별8프레임 파일을 열어 재생·이전프레임 겹치기·도트 수정 가능. run-all-directions.pxpen은64프레임 모음이며 한 방향의 반복 재생에는 방향별 파일을 사용합니다.
- SpriteFrames: art/export/heroine-run-v1/heroine-run.tres. 독립 F6 장면: scenes/characters/heroine_run_preview.tscn. Space로 일시정지.
- 기본 드레스/숄/회갈색 부츠 조합은 새 도트. 다른 장비 조합은 기존 Blender 렌더러로 표시해 장비 기능을 보존합니다.

## 한계와 보존

선택된 생성 시트를 분리한 결과이며 PixelPen에서 직접 손수 보정했다고 주장하지 않습니다. 일부 뒤쪽 대각선의 구분과 원본 보행 자세의 일관성은 미술 보완 대상입니다. 독립 대기 원화가 없어 정지는 달리기 두 번째 자세를 사용합니다. 보간 프레임을 합성하거나 서로 다른 방향의 신체를 섞지 않습니다.

생성 PNG는 각 프레임을32색 공통 팔레트/이진 알파로 등록했습니다. 프레임 자체와 PixelPen 파일을 모두 보존합니다. 재패키징 명령은 생성 시트에서 편집 파일을 재생성하므로 PixelPen 수동 편집 후에는 실행하지 마십시오. PixelPen에서 수정·저장한 뒤 `python scripts/sync-heroine-run.py`를 실행하면 방향별 .pxpen의 팔레트·레이어·타임라인을 읽어 게임 아틀라스에 동기화합니다. 편집 원본은 덮어쓰지 않습니다. 웹에는 이후 Web export가 필요합니다.

원본 Blender/기존2D 자산은 보존하며 이동 속도·충돌·서버 판정은 변경하지 않습니다. 실제 브라우저 조작은 요청 없이 실행하지 않습니다.

## PixelPen 헤드리스 세부 보정 · 2026-10-28

`tools/patch_pixelpen.gd`는 설치된 PixelPen의 ProjectPacker, IndexedColorImage, PNG 출력 기능을 직접 호출합니다. JSON 계획의 `source`, `output`, `export_dir`, `edits`를 읽으며, 각 수정은 0부터 시작하는 `frame`, `layer`(기본 0), `x`, `y`, 기존 팔레트 번호 `expected`, 새 팔레트 번호 `index`로 지정합니다. 모든 좌표와 기존 값을 확인한 뒤 별도 파일로 저장하고, 다시 로드해 수정값을 검사합니다. 원본 덮어쓰기 전에는 반드시 백업과 전후 이미지를 남깁니다.

실행 형식: `Godot_v4.5.1-stable_win64_console.exe --headless --log-file <쓰기 가능한 절대 로그 경로> --path <godot-arcana 절대 경로> --script res://tools/patch_pixelpen.gd -- --plan=<JSON 절대 경로>`. 이 환경에서는 기본 user 로그 경로 접근 실패로 Godot가 종료될 수 있으므로 명시적인 로그 경로를 사용합니다.

첫 보정은 S/2의 홍채 1픽셀, S/3의 소매 연결부 3픽셀, SE/1의 눈 1픽셀입니다. 투명 결손만 채웠으며 자세·타이밍·실루엣은 유지합니다. 방향별 원본과 64프레임 모음을 함께 갱신하고 sync 스크립트로 로컬 아틀라스·프레임에 반영했습니다. 백업, 좌표 계획, PixelPen 네이티브 출력과 전후 비교는 `art-studies/arcana-hero/white-bob-heroine/pixel-run-v1/pixelpen-polish/`에 있습니다. 새 중간 동작 추가·전체 모션 품질 검수·웹 재빌드는 이번 보정에 포함하지 않았습니다.
