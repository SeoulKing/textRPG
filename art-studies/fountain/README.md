# 승인된 2D 천체 분수

2026-10-28 사용자가 approved-concept.png를 승인하고 물 흐름 애니메이션을 요청했습니다.

- source/fountain.png: 내장 image_gen으로 컨셉을 참조해 별도로 제작한 투명 분수 원화입니다. 컨셉 바닥 전체를 축소한 자산이 아닙니다.
- scripts/build-fountain-art.cjs: 투명 객체 경계 정리, 최근접 원본 도트 정규화, 기존 LUT 고정색 변환과 물 마스크 기반 16프레임 제작을 재현합니다. 실행: node scripts/build-fountain-art.cjs
- 게임 자산: godot-arcana/art/export/reference/fountain-2d.png, fountain-water-atlas.png. 296×359 프레임, 4×4 아틀라스, 12fps, 64px/단위, 발/지면 중심 (148,268)입니다.
- 등록 원점은 수반의 앞쪽 끝이 아니라 지면 원의 중심입니다. 폭 288px=4.5단위이며 기존 fountain_spec.gd의 반경 2.25를 유지합니다. 정면형 3/4 yaw0/pitch45, 이진 알파·최근접·무밉맵·손실 없는 압축입니다.
- water-mask.png에서 빨강은 낙수, 초록은 수면입니다. 네 곡선의 제어점과 낙수 위치는 manifest.json에 보존합니다. 금속·석재·구체·알파 실루엣은 전 프레임 고정합니다. 낙수 하이라이트는 아래로 이동하고 수면은 픽셀 단위로 이동하며 낙수점 파문이 확장됩니다.
- fountain_sprite.gd는 공통 illustrated_prop.gd를 사용해 원래 분수 노드에 연결됩니다. 불투명/반투명 가림 양쪽에 같은 프레임을 적용합니다. world.time으로 동기화하고 효과 끄기·동작 줄이기에서 0프레임으로 고정합니다. 편집기에서는 자체 미리보기 시계를 사용합니다.
- 기존 3D 분수 제작 코드는 보존하되 현재 fountain 등록은 2D를 우선합니다. 이전 3D 물방울 오버레이는 제거해 두 방식이 중복 표시되지 않습니다. 위치·저장 ID·충돌·공유 조명/LUT·바닥 상감은 그대로입니다.
- 물 미리보기: water-animation.gif. GPU 실제 장면: godot-arcana/art/reference/fountain/. 브라우저 플레이와 사용자 최종 미술 승인은 별도입니다.

분수의 그림 지면 중심은 (148,268)입니다. 기존 (148,253)은 원형 반경과 카메라 각도로 추정해 약15px 빗나간 값이었습니다. fit-fountain-ground.cjs의 하단 실루엣 타원 실측과 fountain_ground.generated.gd를 기준으로 합니다. 바닥 장식은 가로 크기를 유지하고 깊이만7.191603단위로 보정해 이 원화와 같은 타원 비율을 갖습니다.
