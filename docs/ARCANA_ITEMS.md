# 아르카나 아이템 마스터

## 관리 경계

아르카나 15종의 ID, 이름·설명, 종류·등급, 효과, 분류, 생활 도구 슬롯, 거래 가격과 썸네일을 DB에서 함께 조회합니다. 다른 세계의 아이템이나 기존 보유 수량을 이관·초기화하지 않습니다.

- 게임 정의의 작성 원본: src/game/data/items.ts. 실제 아르카나의 허기·마나·모닥불 효과와 가격은 기존 online/life.ts 및 arcana-shop.ts에서 가져옵니다. 공통 생존 효과와 다른 아르카나 포션·생선구이의 표시 정의는 마스터를 만들 때 아르카나 규칙에 맞춥니다.
- 미술·분류의 작성 원본: src/game/data/arcana-item-assets.json. ID별 분류와 thumbnail.path, 선택적인 아틀라스 영역, PixelPen 원본 경로, 제작 상태를 한곳에서 관리합니다.
- DB 레코드: 기존 OnlineStore의 arcana_item_master 종류, ID는 아이템 ID입니다. schemaVersion, fingerprint, updatedAt, item 전체 정의를 저장합니다. PostgreSQL 구성에서는 arcana_online_records의 kind/id/payload, 현재 로컬 파일 모드에서는 .runtime/arcana-online.json의 records에 저장됩니다.
- 동기화: 서버 시작 때 작성 원본을 검증하고, 새 항목이나 바뀐 항목만 기존 저장소의 트랜잭션으로 upsert합니다. 실제 저장한 레코드를 읽어 런타임 카탈로그를 구성합니다. 같은 버전의 재시작에서는 updatedAt을 불필요하게 바꾸지 않습니다. 캐릭터 수량·장착·골드와 카탈로그는 별개입니다.
- 카탈로그는 게임 정의에서 동기화하는 관리 목록입니다. DB 레코드 직접 편집을 게임 밸런스 편집 API로 취급하지 않습니다. 다음 동기화 때 작성 원본과 일치하도록 갱신합니다.

## 조회와 표시

GET /api/arcana/items → schemaVersion, realm, count, items, missingThumbnails.

세계 입장·전체 상태 응답의 arcanaItemCatalog에도 같은 DB 목록을 전달합니다. 소지품 화면은 마스터의 정의와 썸네일을 사용하며, 아이템별 이미지 경로를 GDScript에 따로 열거하지 않습니다. 아틀라스 아이템은 region을 적용하며 이미지 미등록 항목은 기존 공통 아이콘을 사용합니다. 이동 패킷마다 카탈로그를 재전송하지 않습니다.

썸네일 상태:
- ready: 독립 PNG를 표시합니다. 승인된 기존 PNG는 재사용합니다.
- atlas: 기존 아틀라스의 지정 영역을 표시합니다. 현재 모닥불 3등급이 해당합니다.
- missing: 이미지가 아직 없음을 명시합니다. 현재 slimeMucus·runeCompass입니다. 새 미술 승인 없이 별도 디자인을 임의 생성하지 않습니다.

## 아이템 추가/수정

1. items.ts에 게임 정의를 추가합니다.
2. arcana-item-assets.json에 같은 ID와 분류·썸네일 상태를 등록합니다.
3. ready/atlas 경로의 PNG를 art/export/에 연결합니다. 새 미술은 해당 승인 절차를 따릅니다.
4. 서버 컴파일·재시작 시 DB에 동기화됩니다. Godot의 동적 이미지가 웹 패키지에 들어가도록 기존 웹 빌드도 수행합니다.
5. 조회 API 또는 DB의 arcana_item_master 레코드로 저장 결과를 확인합니다. 플레이 테스트는 별도 요청 시에만 수행합니다.

## 낚싯대 썸네일

승인된 MYSTIC 3번의 짙은 목재·남색 손잡이·청금색 보석·은빛 고리·파랑/상아색 찌를 64×64 투명 PNG로 제작했습니다. 다른 물고기나 도구가 섞인 시트를 잘라 쓰지 않습니다.
- PixelPen: godot-arcana/art/source/items/fishing-rod-mystic-v1/fishing-rod.pxpen
- 팔레트/픽셀 사본: 같은 폴더 fishing-rod.json
- 게임 PNG: godot-arcana/art/export/items/fishing-rod.png
- 생성/재열기 도구: godot-arcana/tools/author_rod_thumbnail.gd
- 저장·재열기 후 출력하며, 8픽셀 투명 여백을 둡니다. preview.png는 밝은/어두운 배경의 제작용 2배 비교입니다.
