# 분수 주변 모자이크 바닥

승인 컨셉: approved-concept.png. 내장 image_gen으로 별도 제작한 원본: source/mosaic-ring.png. 전체 생성 지시는 source/prompt.txt입니다.

- 544×544px 투명 PNG, 중심(272,272), 64px/월드 단위, 가로 캔버스8.5단위·보정 깊이7.191603단위입니다. 가로 바깥 반경은4.1875단위를 유지합니다.
- 원화는 완전한 탑뷰 원형입니다. X/Z 지면에서 카메라가 3/4 투영합니다. 분수 원화 밑면의 실측 타원비0.598262를 맞추기 위해 지면 UV의 깊이를 카메라 sin(45°) 대비0.846071배로 보정합니다. 이미지 자체는 탑뷰를 유지합니다.
- 기존 월드 LUT·이진 알파·최근접·무밉맵·손실 없는 압축을 사용합니다.
- 청금석색 조각, 금빛 천체 곡선과 별 메달8개, 안팎 크림색 방사형 석재로 구성합니다.
- scripts/build-fountain-paving.cjs가 원화 알파의 유효 영역에서 정사각형을 등록하고 도트 크기·팔레트·알파를 정리합니다. sourceCrop과 실제 색 수는 manifest.json에 있습니다.
- illustrated_art.gd의 공통 바닥 재질과 illustrated_ground.gdshader에서 분수의 mosaic_center에 합성합니다. 게임과 3D 편집기가 같은 자산을 읽습니다.
- 이전 단색 상감을 드러내던 discard를 제거했습니다. 주변 판석 위에 실제 투명 원형 장식을 합성해 틈과 이중 테두리를 피합니다.
- 이 장식은 정해진 분수 지름의 독립 모듈이며 기본 판석 반복 Terrain 타일을 대체하지 않습니다. 장식만의 충돌은 없습니다.
- 분수 본체/낙수 애니메이션·배치·충돌·사용자 저장은 바꾸지 않습니다.

재제작: 번들 Node와 sharp 환경에서 scripts/build-fountain-paving.cjs. 전체 reference 재제작에도 같은 빌더를 연결했습니다.
확인: scripts/render-fountain-paving.ps1은 main.tscn의 정지 미술 출력만 만들며 플레이어 저장이나 API를 조작하지 않습니다. 웹 패키지 렌더와 소스 렌더는 제작 기록에서 구분합니다.

웹 빌드: scripts/build-fountain-paving.ps1은 작업 전용 .runtime/godot/fountain-paving-web에 출력하므로 확인 후 index.html/index.js/index.wasm/index.pck를 godot-web에 반영합니다. 공용 경로에 직접 내보내면 다른 작업의 결과가 덮일 수 있습니다. 이번 제작은 실제 전용 PCK의 셰이더/텍스처와 main.tscn GPU 출력까지 확인한 뒤 공용 경로에 반영하고 서버 제공 해시를 맞췄습니다.
