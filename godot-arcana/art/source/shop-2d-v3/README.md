# 상점 2D 타일맵

활성 장면은 `godot-arcana/scenes/shop_2d.tscn`, 공유 라이브러리는 `godot-arcana/art/resources/shop_2d_tileset.tres`입니다. 활성 타일·가구 등록은 `godot-arcana/art/export/shop-2d/assets.json`, 편집 원본은 이 폴더의 `*.pxpen`입니다. 이전 shop-2d / shop-2d-v2 원본은 제작 과정 보존 자료이며 활성 편집 원본이 아닙니다.

## Godot에서 배치

- 상점 장면을 열어 루트를 선택하면 실제 정면형3/4 조합을 봅니다. Floor·HighWalls·LowWalls·Furniture·Decorations 중 TileMapLayer를 선택하면 기본2D 타일맵 편집 좌표로 전환합니다. 타일 팔레트에서 선택해 칠하거나 지웁니다.
- 격자1칸은0.5월드 단위·32원본픽셀입니다. 바닥은 Floor에만 칠합니다. 가구는 최소 X/Z 점유 칸을 기준으로 놓으며 그림의 투명 여백은 점유가 아닙니다. 충돌 도형과 경고로 점유를 확인합니다.
- 기본 TileSet의 Patterns에는 연속 바닥 묶음과 선반5개 묶음이 있습니다. 뒷벽은 Terrain 연결도 지원합니다. 모서리·좌우 경계·문턱은 대응하는 완결된 항목을 선택합니다.
- 카운터는1개만 둡니다. 상인과 거래 위치는 카운터를 따라갑니다. 출입문도1개만 두며 도착·퇴장 위치가 함께 이동합니다.
- 루트/레이어 변환과32×32 TileSet 격자를 고정하고 칠한 셀을 옮깁니다. 중복 가구·벽 침범·가구 밑 바닥 누락·잘못된 레이어·막힌 출입/거래 위치는 장면 경고로 표시합니다.
- F6은 독립 정지 미리보기입니다. 실제 이동·거래·출입은 main.tscn 실행에서 기존 서버와 함께 사용합니다. 웹 산출물은 별도 내보내기가 필요합니다.

## 원본과 재출력

PixelPen에서 이 폴더의 자산을 수정하고 저장합니다. 아래 Native 단계는 기존 PixelPen 원본을 우선 다시 열어 내보내므로 수동 보정을 준비 이미지로 덮지 않습니다.

```powershell
./scripts/run-shop-2d.ps1 -Action Sync
./scripts/run-shop-2d.ps1 -Action Native
./scripts/run-shop-2d.ps1 -Action Import
./scripts/run-shop-2d.ps1 -Action Check
./scripts/run-shop-2d.ps1 -Action Capture
./scripts/run-shop-2d.ps1 -Action Layout
```

라이브러리 규격을 의도적으로 변경할 때만 `-Action Build -RebuildLibrary`를 사용합니다. 일반 Build는 기존 타일 라이브러리와 칠한 셀을 보존합니다. 수동 TileSet 변경이 있다면 먼저 보존하고 등록 원본과 함께 맞춥니다. 새 원본의 준비 공정은 `scripts/build-shop-2d-art.cjs` → `scripts/finish-shop-2d-art.cjs`이며 기존 PixelPen 원본을 대체하는 명령이 아닙니다.

온라인 서버는 시작 시 `art/export/online-layout.json`을 읽습니다. 배치를 바꾼 뒤 Layout 단계로 상점 항목을 갱신하고 서버를 재시작해야 서버에도 반영됩니다. 이 작업은 사용자 게임/브라우저를 조작하거나 실제 거래·저장 요청을 보내지 않습니다.

## 확인 근거

`art-studies/regions/arcana-shop-interior/source/native-2d/`에 기하/배치 검사, 실제 World/Renderer 진입·복귀 검사, 서버 판정 비교, PixelPen 저장·재열기·PNG 출력 기록과 가로·세로·근접 GPU 정지 렌더가 있습니다. 원본 도트는 이미 투영된 그림이므로 가구·인물을 다시 세로 압축하지 않습니다. 바닥만 월드 깊이를2D 캔버스에서 sin45°로 투영하며 클릭 좌표에는 역변환을 적용합니다.

## 창문 실시간 조명과 캐릭터 그림자

`shop_world_2d.gd`가 `shop_sunlight_2d.gd`의 PointLight2D를 연결합니다. 햇빛 영역은 기존 바닥 원화(896×576)의 왼쪽 창살 무늬에 맞추며, 바닥 셀을 지운 곳은 광원 마스크에서도 제외합니다. 원본 PNG는 보존하고 `shop_sun_floor.gdshader`가 조명 중복으로 과도하게 밝아지는 것을 보정합니다. 원화에 그려진 빛 자체를 분리한 자산은 아니므로 효과를 꺼도 기존 그림은 유지됩니다.

플레이어·상인·접속자의 현재 프레임을 발 기준으로 바닥에 투영하고 `shop_sun_shadow.gdshader`로 햇빛 영역에만 그림자를 표시합니다. 실시간 조명은 기본 2D 광원이며 캐릭터 그림자는 유한한 실루엣 투영입니다. 가구 차광이나 3D 높이 기반 광선 추적은 포함하지 않습니다. 효과 끄기는 추가 조명과 그림자를 함께 끕니다. 밝기는 SUN_ENERGY, 그림자 방향·길이는 Transform2D의 두 번째 축에서 조절합니다. 광원 무늬를 바꾸거나 바닥 셀을 편집한 경우 장면을 다시 열면 마스크가 갱신됩니다.

이번 변경은 스크립트 구문을 확인하며, 실제 화면·이동 확인과 웹 내보내기는 별도입니다. 직접 확인할 때 상점 왼쪽 햇빛을 가로질러 밝기 변화와 발에서 이어지는 그림자, 가구 아래의 가림, 효과 끄기를 확인합니다.