# 아르카나 도심 제작 원본

`approved-concept.png`는 사용자가 “오 좋다 이렇게 만등러줘”로 승인한 도시 디자인입니다. 실제 게임 출력은 `render/`에 별도로 보존합니다.

- `source/city-kit.png`: 내장 image_gen으로 만든 6종 독립 자산 원본. 생성 지시는 `source/city-kit.prompt.txt`입니다.
- `manifest.json`: 각 자산의 실측 크롭·출력 크기·발 기준점·충돌 영역·원본 64px/단위·팔레트와 투영 계약입니다.
- `layout.json`: 승인 방향으로 작성한 지면 영역과 독립 배치의 제작 레시피입니다. 런타임 자동 로드 데이터가 아닙니다.
- `source/baseline/`: 이 작업 직전의 장면·지면·충돌 및 포탈 진입 코드 보존본입니다. Git의 다른 작업을 되돌리는 데 사용하지 않습니다.

게임의 편집 원본은 `godot-arcana/scenes/plaza.tscn`과 `scenes/ground/city_ground.tscn`입니다. 새 독립 노드는 `CityDistrict/Housing`, `Market`, `StreetFurniture`, `Gardens` 아래에 있으며, 주요 건물과 기능 ID는 기존 노드에 남습니다. 주거 외관은 장식이며 새 실내·퀘스트를 구현한 것으로 취급하지 않습니다.

`package-arcana-city.py`는 저장된 원본 시트에서 6개 자산을 잘라 원본 비율·공통 LUT·이진 알파·최근접으로 출력하고 `city_center_assets.gd`를 등록합니다. 이미지를 다시 생성하거나 기존 건물을 덮어쓰지 않습니다.

`author-arcana-city.py`는 **최초 배치 제작 레시피 재실행용**입니다. 보존한 baseline에서 plaza.tscn을 다시 쓰므로, 이후 에디터 수동 편집을 유지할 때는 실행하지 않습니다.

`build-arcana-city.ps1`은 현재 저장 장면을 고유한 애드온 없는 stage에 복사하고 가져오기 및 서버 충돌을 출력합니다. `-Render`로 오프라인 장면 3장을 만들고, `-Export`로 전용 출력에서 웹 산출물을 만든 뒤 공용 경로에 반영합니다. `-AuthorGround`는 layout.json으로 지면을 명시적으로 다시 작성하는 옵션이므로 수동 편집 지면에는 사용하지 않습니다. 반복 빌드는 기존 지면을 보존합니다. `-StagePath`를 주면 이 작업의 stage와 가져오기 캐시를 재사용합니다.

실제 실행 확인은 사용자가 진행합니다. 광장에서 남문으로 걸어 내려가기, 상점·여관·식당 접근과 출입, 건물 앞뒤 가림, 기존 저장 재접속 후 끼임 여부를 확인합니다.
## 현재 바닥 · 승인된 청금 천체 문양

사용자가 일반 돌바닥 방향을 거절하고 청금색 길·천체 문양이 있는 마법도시 시안을 승인했습니다. 기준 이미지는 `source/magic-ground-v1/approved-concept.png`이며 이전 일반 자갈 바닥은 보존본입니다.

`build-arcana-magic-ground.py`가 실제 월드 좌표에 맞춰 편집 가능한 `magic-ground-master.svg`를 만듭니다. 전체 원본은 4608×3072, 월드 범위는 X0~72/Z8~56, 밀도는 64픽셀/단위입니다. 런타임은 두 개의 연속된 2304×3072 SVG로 나누어 최대 텍스처 크기 부담을 줄이고, 같은 월드 좌표에서 반복 없이 샘플링합니다. 불규칙한 옅은 석재의 세부와 청금색 인레이를 원본 해상도에서 그리며 기존 작은 이미지를 확대하지 않습니다.

`magic-ground-v1.json`에 원본·시안·승인·좌표 등록·출력 계약을 보존합니다. 분수 중심(36,28.925), 학교 문양(54,30.65), 남문 별 메달(36,47.1)을 기준으로 합니다. 지면·정원 표시 영역은 저장된 `plaza.tscn`의 paved_areas/garden_areas를 사용하고 건물·충돌·저장 계약은 유지합니다.

`render_city_center.gd`는 같은 main.tscn 게임 렌더러로 조감도·남문·상점 거리와 나무/가로등/바닥의 가까운 비교 화면을 출력합니다. 바닥 가져오기 크기도 로그에 기록합니다. 실제 브라우저 플레이와 최종 미술 확인은 별도입니다.
## 현재 디테일 작업 · 구역별 1차

기본 청금 천체 방향은 유지합니다. `district-detail-plan.json`에 현재 광장·남문 큰길의 범위와 상점/학교/여관의 후속 구역을 나누었습니다. 품질 참조는 기존 `art/export/fountain-paving/mosaic-ring.png`입니다.

`arcana_ground_details.py`가 지역별 석재 마감과 인레이 마감층을 작성하고 `build-arcana-magic-ground.py`가 같은 좌표·해상도의 SVG에 합칩니다. 전체를 늘리거나 새 타일을 반복하지 않습니다. 기존 빌더와 master SVG의 수정 전 사본은 `source/magic-ground-v1/before-district-detail-01/`에 있습니다. `magic-ground-v1.json`의 detailPass에 실제 적용 구역·범위·기준을 기록합니다.

실제 근접 출력은 `render/district-detail-01-close.png`, 큰길은 `render/district-detail-01-street.png`입니다. 이전 `magic-ground-v1-detail.png`는 구역 마감 전 비교 기준으로 보존합니다.