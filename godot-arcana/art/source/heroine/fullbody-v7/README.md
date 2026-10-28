# 기준 얼굴 복원 v7

사용자가 v6 얼굴이 기준 그림과 다르고 못생겨졌다고 지적했습니다. 단색 평탄화·눈 도트의 좌우 복제·새 입 표시가 원본의 표정을 바꾼 결과를 거부한 것으로 적용합니다. 기준은 앞서 사용자가 지정한 선택된 run-v1 달리기 원본입니다.

각 방향의 원본 두 번째 자세(frame1)의 개별 눈매·눈 위치·코·입·볼·턱선을 얼굴 영역에서 복원했습니다. 눈을 공통7×7도형으로 새로 복제하지 않습니다. 수치 규격은 기준 얼굴을 실측하고 같은 방향의 프레임을 정렬하기 위한 자료이며, 기준 표정을 숫자에 맞춰 다른 얼굴로 바꾸는 근거가 아닙니다.

눈/입/턱 경계는 원본 그대로 두고, 눈과 입에서 떨어진 피부 내부의 진한 붉은 점만 정면5/대각선1/측면2픽셀을 기본 피부색으로 낮췄습니다. 그밖의 하이라이트·볼색·입 모양을 지우지 않았습니다. 반대방향은 동일 인물 기준의 반전입니다. 뒷면은 얼굴 수정이 없습니다.

얼굴 패치는 v6의 head_offset과seat_offset을 따라갑니다. 머리·목·어깨의 동반 움직임, 전신 크기, 팔·다리, 시전 시간은 바꾸지 않았습니다. reference-audit.json은 얼굴이 보이는98프레임의 기준 얼굴과 비교해 허용한 피부 도트 외 차이0,얼굴 영역 밖의v6대비차이0을 확인합니다. 깜빡임은 눈꺼풀 영역만 예외입니다. 비교 원본은 등록명세 references에 명시합니다.

원본:pixelpen/25프로젝트152프레임. 네이티브PixelPen에서 수정·저장·재열기·PNG출력했습니다. 실제 기록은plans/native-result.json과.runtime/godot/fullbody-v7-face-restore-native.log입니다. Python으로 .pxpenZIP을 쓴 것이 아니며, 마우스로 모두 클릭해 그렸다는 주장도 하지 않습니다.

일반반영:python scripts/sync-heroine-fullbody.py --source fullbody-v7 --export heroine-fullbody-v7
기준얼굴비교:python scripts/audit-heroine-face-reference.py

PixelPen에서 수정한 뒤 최초제작계획을 다시 덮어쓰지 마십시오. v6와run-v1을 보존합니다. 계획된비교판보다native-frames/의실제저장본과preview/reference-restored-front.png를 우선합니다. 게임과Web반영결과는PRODUCTION.md최신항목을 따릅니다. 사용자 미술승인은 별도입니다.