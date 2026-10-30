# 승인된 정지 대기 모션 · 2026-10-28

승인 시안은 approved-concept.png, 5방향×4자세 생성 원본은 idle-sheet-source.png입니다. S/SE/E/NE/N을 생성하고 NW/W/SW는 등록된 오른쪽 방향을 발 x=48 기준으로 반전합니다. 잘못된 7행 초안은 사용하지 않습니다.

`python scripts/package-heroine-idle.py`가 실측 셀을 분리하고 기존 달리기의 32색·이진 알파·최근접·96×136·발(48,116)·64px/단위로 등록합니다. 프레임은 frames/, 등록값은 spec.json, 게임 시트는 art/export/heroine-idle-v1/heroine-idle.png입니다. 달리기 PixelPen 원본과 수동 보정은 덮어쓰지 않습니다.

neutral 1.15초 → inhale 1초 → exhale 1.85초 → blink 0.13초, 총 4.13초 반복입니다. 이동·시전·벤치에서 복귀하면 처음부터 시작합니다. 모션 감소/효과 끄기에서는 기본 자세를 유지하고 월드 시간이 멈추면 대기도 멈춥니다. 시전과 벤치 동작을 우선 표시합니다. 기본 의상에 적용하며 다른 의상은 기존 렌더러를 사용합니다.

registered-preview.png는 8방향 등록 결과이고 idle-preview.gif는 정면 자산 미리보기입니다. 생성 원화의 자세별 작은 형태 차이가 남아 있으며 수동 PixelPen 보정을 거쳤다고 주장하지 않습니다. 실제 게임 확인과 최종 미술 승인은 별도입니다.

웹 반영: `scripts/build-heroine-idle.ps1`의 전용 stage/export에서 Godot 가져오기·웹 빌드·광장 출력이 성공했습니다. 게임 파일을 godot-web에 반영했고 서버 PCK 해시 일치를 확인했습니다. 게임 장면 미리보기는 art/reference/heroine-idle-v1/game-idle-preview.gif입니다. 실제 플레이는 사용자가 직접 확인합니다.
