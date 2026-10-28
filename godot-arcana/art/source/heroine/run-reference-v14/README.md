# 생성 레퍼런스 기반 오른쪽 달리기 · 8프레임

사용자가 `generated-keyposes-v1.png`를 토대로 PixelPen 달리기 수정을 요청했습니다. 레퍼런스의 각 셀에 그려진 다리·부츠의 완성된 실루엣을 0.21배로 등록하고 기존 잠긴 팔레트에 대응시켜 PixelPen의 인덱스 도트로 옮겼습니다. 별도 부츠 패치를 회전하거나 관절 선분으로 다리를 그리는 v12/v13 방식은 사용하지 않았습니다.

원본 얼굴·머리·상체와 치맛단의 실제 가림을 유지합니다. 하체는 생성 레퍼런스의 보폭과 발 방향·무릎 회수를 따릅니다. 생성 이미지의 회색 바탕을 색상 차이로 제외하고 기존 의상 실루엣을 다시 겹쳐 연결했습니다. 등록 정보는 `reference-registration.json`입니다.

`pixelpen/run_e.pxpen`이 PixelPen 기능으로 수정·저장·재열기한 편집 원본입니다. `native-frames/run_e/`는 그 저장본의 출력입니다. 도구는 `godot-arcana/tools/author_heroine_run_reference.gd`, 후속 포장만 수행하는 도구는 `scripts/package-heroine-run-reference.py`입니다. 최초 제작기를 수동 편집 후 다시 실행하지 마십시오.

`preview/run_e-native.gif`는 수정본 단독, `preview/idle-before-after.gif`는 대기 기준 / v13 / 이번 수정본입니다. `run-e-sheet.png`는 96×136 셀 8개를 가로로 나열한 시트입니다. 저장본 팔레트 및 상단 84행 보존을 포장 시 확인했고 정지 프레임 비교를 수행했습니다. GIF는 편집 타이밍 12fps이며 실제 게임 타이밍은 아닙니다.

사용자가 오른쪽 달리기를 승인하고 적용을 요청했습니다. 이 폴더가 활성 원본이며 나머지 24개 PixelPen 클립은 기존 run-stride-v11에서 그대로 복사했습니다. heroine_run.gd와 animation-pipeline.json은 heroine-run-reference-v14 출력을 사용합니다. 일반 반영은 python scripts/sync-heroine-fullbody.py입니다. 이전 편집본은 보존합니다. 게임 플레이 테스트는 수행하지 않았습니다.
