# 승인된 방식의 8방향 달리기 확장

사용자가 오른쪽 v14 동작을 긍정 평가하고 나머지 방향에도 같은 방식의 수정을 요청했습니다. 오른쪽 원본은 바이트 그대로 보존하고, 나머지 7방향의 다리/부츠를 생성 레퍼런스의 완성된 실루엣에서 PixelPen 인덱스 도트로 옮겼습니다. 각 방향의 얼굴·머리·상체·의상 가림과 기존 팔레트를 보존합니다. 대기·시전·벤치 17클립도 변경하지 않았습니다.

레퍼런스는 `art-studies/arcana-hero/white-bob-heroine/run-motion-reference/generated-other-directions-v1.png`입니다. 정면·앞사선·뒤사선·뒷면을 별도 제작했으며 왼쪽 하체는 대응하는 오른쪽 하체를 반전해 배치했습니다. 의상 전체를 반전하지 않았습니다. 뒤사선 셀 아래로 다음 행의 머리가 섞이지 않도록 레퍼런스 크롭을 조정했습니다.

편집 원본은 `pixelpen/`, 네이티브 출력은 `native-frames/`, 방향별 GIF와 전체 비교판은 `preview/`입니다. 최초 제작기는 `godot-arcana/tools/author_heroine_run_directions.gd`이며 PixelPen 저장·재열기 API를 사용했습니다. 수동 편집 후 최초 제작기를 다시 실행하지 마십시오. 일반 출력 반영은 `python scripts/sync-heroine-fullbody.py`입니다.

현재 명세와 표시기는 `heroine-run-reference-v15`를 사용합니다. 저장본 내보내기와 프레임 비교를 수행하며 플레이/브라우저 테스트는 실행하지 않습니다. 오른쪽의 사용자 승인은 기록돼 있으나 나머지 방향에 대한 최종 사용자 미술 평가는 별도입니다.
