# 메이 대기 보정 v2

v1은 머리와 상체의 일괄 1픽셀 이동과 직선 눈꺼풀 때문에 자연스러움이 부족했습니다. v1 PixelPen을 읽어 별도 v2 원본으로 작업했으며 기존 원본을 덮어쓰지 않았습니다.

## 보정 범위

- 승인 PNG를 모든 자세의 숨김 REFERENCE 레이어로 유지하고 PixelPen 네이티브 `IndexedColorImage.set_index_on_color_map`으로 편집했습니다.
- 호흡 중 머리·얼굴·목·브로치·손·지도·치맛단·발은 이동하지 않습니다. 어깨/가슴의 제한된 주름 도트가 먼저 변하고 망토의 주름이 뒤따릅니다. 전신 또는 상체의 행 단위 이동을 사용하지 않습니다.
- 눈꺼풀은 같은 높이의 직선 덮개 대신, 앞머리에 일부 가려진 왼눈과 오른눈의 원래 곡선·색을 열별로 따라 닫습니다. 감은 눈에도 곡선이 있습니다.
- 중립과 호흡 변화 4단계에 눈꺼풀 상태를 조합한 10개 자세, 12fps/96셀/8초 반복입니다. 반복 주기 안에서 두 눈깜빡임의 간격과 체류 시간이 다릅니다. 중립/들숨/감은 눈 등의 실제 체류 시간은 animation.json과 PixelPen 타임라인에 있습니다.
- 프레임96×136, 발(48,116), 64px/단위, 승인된 신체 비율과 웃는 입을 유지합니다.

## 편집과 반영

편집 원본은 `mei-idle.pxpen`, 도트 수정 좌표는 `pixelpen-edits.json`, 실제 저장·재열기 출력은 native-frames/입니다. PixelPen에서 작업 레이어를 수정하고 REFERENCE 레이어는 비교에 사용합니다. UI 마우스 작업으로 보고하지 않습니다.

```powershell
# 저장본만 내보내기. --create는 최초 생성용이며 이후 사용하지 않습니다.
& .runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_mei_idle_v2.gd
python scripts/package-mei-idle.py
```

공용 mei-idle PNG/SpriteFrames와 mei_sprite.gd가 이 v2 원본을 사용합니다. 표시기는 시트의 실제 크기로 격자를 정하고 SpriteFrames의 AtlasTexture 영역에 따라 frame_cell만 갱신합니다. 재생 중 텍스처 교체나 GPU 픽셀 읽기를 하지 않습니다. 동작 줄이기/효과 끄기 설정에서는 승인 중립 자세를 사용합니다. v1 명령은 보존 이력이므로 현재 공용 자산에 다시 적용하지 않습니다.

자세 비교판을 확인하고, 등록 과정에서 승인 중립의 픽셀 일치·치맛단/부츠 고정·이진 알파를 확인했습니다. 자연스러움에 대한 최종 판단은 사용자 검토로 남깁니다. 브라우저 플레이 테스트는 수행하지 않았습니다.

웹 반영: v2 시트/SpriteFrames가 빌드 사본과 일치하며, 별도 가져오기/Web 내보내기를 완료했습니다. 공용 godot-web 파일은 이전 파일을 보존하며 원자 교체합니다.

서버가 중지된 상태여서 기존 .server-dist/server.js를 숨김 프로세스로 시작한 뒤 HTTP 200과 응답/디스크 PCK 해시 일치를 확인했습니다. SHA256: 1c862b88556cfdd2de4542bc1bbac8e4bdab43b15edf866844cbd53716e9de55. 브라우저 플레이는 수행하지 않았습니다.


## 2026-10-29 · 사라짐 제보 후 PixelPen 재검사

PixelPen ProjectPacker.load_project와 PixelPenProject.get_image로 저장본을 다시 열고 10자세·96칸을 확인했습니다. 모든 본체 레이어는 표시 상태이며 REFERENCE는 숨김 상태입니다. 자세마다 불투명 픽셀3,092개, 부분 알파0개, 범위(24,17)-(72,116)이며 저장된 native-frames와 픽셀 단위로 일치합니다. 빈 프레임이나 끊어진 타임라인 참조는 발견되지 않아 미술 원본은 수정하지 않았습니다. frame-audit/audit.json과 pixelpen-poses-2x.png에 근거를 보존합니다.

표시기/패키징 조치: 단일 시트의 셀만 전환하고, 정적 메이 PNG와 애니메이션 PNG에 복제됐던 import UID를 분리했습니다. 패키저는 고유 UID를 보존하고 새 시트에는 Godot가 UID를 부여하게 합니다. 원본/내보낸 PCK 모두96칸 GPU 출력에서 메이가 유지되고 반복 시작·동작 줄이기가 중립과 같음을 확인했습니다. godot-web을 새 패키지로 교체했으며 브라우저 플레이는 별도로 실행하지 않았습니다.
