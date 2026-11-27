# 메이 · 정면 대기 애니메이션

승인된 메이 v3와 일반 캐릭터 비율을 유지합니다. `reference.png`는 이번 작업의 실제 기준 도트 사본입니다.

## PixelPen 원본과 보정

`mei-idle.pxpen`은 설치된 PixelPen 1.1.4 네이티브 클래스에서 제작·저장·재열기한 편집 원본입니다. 모든 자세에 승인 메이를 담은 독립적인 숨김 REFERENCE 레이어가 있습니다. PixelPen에서 해당 레이어의 눈 아이콘을 켜서 비교할 수 있습니다. 타임라인의 보이는 작업 레이어를 편집하며, 기준 레이어는 수정하지 않습니다.

`IndexedColorImage.set_index_on_color_map`으로 같은 도트와 기존 37색을 직접 수정했습니다. `pixelpen-edits.json`에 자세별 변경 좌표와 이전/이후 팔레트 인덱스가 있습니다. 새 AI 이미지나 보간으로 프레임마다 인물을 다시 만들지 않았습니다. UI에서 마우스로 따라 그린 작업으로 보고하지 않습니다.

4자세는 중립/들숨/반쯤 감기/눈 감기입니다. 들숨은 머리·목·어깨·지도·손을 함께 1픽셀 올리고 치맛단과 부츠는 유지합니다. 앞머리에 가린 왼눈과 오른눈의 높이 차이를 보존한 눈꺼풀을 네이티브 도트로 수정했습니다. 웃는 입과 기본 신체 비율은 유지합니다.

40셀, 10fps, 4초 반복입니다. 눈깜빡임은 반쯤 감기→감기→반쯤 감기로 0.3초이며, 나머지 시간은 중립과 들숨의 체류 시간입니다. 각 셀은 PixelPen 타임라인과 출력 SpriteFrames가 같습니다.

## 편집 반영

최초 생성 명령의 `--create`는 원본이 있으면 중단합니다. 수동 수정 이후 최초 생성 스크립트를 재실행해 덮어쓰지 않습니다.

저장본을 내보내려면:

```powershell
& .runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_mei_idle.gd
python scripts/package-mei-idle.py
```

첫 명령은 기존 PixelPen 저장본을 읽어 자세 PNG와 시트를 출력합니다. 두 번째 명령은 가져오기 설정·SpriteFrames·최근접 4배 GIF·자세 비교판을 출력합니다. PNG 합성/파일 등록은 Python, 실제 자세 도트 편집은 PixelPen 네이티브 레이어에서 수행합니다.

활성 연결: `illustrated_art.gd`의 plaza-guide → `mei_sprite.gd` → `art/export/plaza-guide/mei-idle.tres`와 PNG. `pixel3d_world.gd`가 월드 시간과 효과/동작 줄이기 설정을 전달합니다. 효과 끄기 또는 동작 줄이기는 승인된 중립 자세를 사용합니다. 프레임 96×136, 발 (48,116), 64px/단위와 광장 배치·메이 이름·대화는 유지합니다.

저장본 PNG에서 중립이 승인 기준과 일치하고 부츠/치맛단이 움직이지 않음을 확인했습니다. 실제 게임 플레이 테스트는 수행하지 않습니다.

웹 반영: 가져오기/내보내기 완료 후 PNG·SpriteFrames·표시기 스크립트가 PCK에 포함됨을 확인하고 로컬 godot-web에 교체했습니다. 서버 HTTP 200 및 디스크/응답 SHA256 일치: c9834f62925637d91ffca577c739fddc34df587906878ed9574f17cfbd301da8. 게임 브라우저는 조작하지 않았습니다.
