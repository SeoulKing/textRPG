# 마법학교 · 고정 투영 기준 v3

기준 카메라: 정사영, yaw 0°, pitch 45°, 투영면 64px/단위. 실제 설정은 plaza_layout.gd와 pixel3d_world.gd에서 확인합니다.

## 투영 원본

`godot-arcana/tools/render_school_projection.gd`가 기존 학교의 17×4 지면 영역을 기준으로 벽·지붕·두 첨탑·천문대·계단의 입체 기준 도형을 만듭니다. `scripts/render-school-projection.ps1`로 GPU 출력한 `projection-guide.png`를 **기하/카메라 참조**로 사용합니다. 이 도형은 게임 배치나 충돌을 변경하지 않는 제작 도구입니다.

image_gen에는 투영 기준 이미지를 첫 번째 참조로, assets-v2의 학교를 디자인 참조로 전달합니다. 기존 원본의 입면도 시점을 다시 따라가지 않도록 두 이미지의 역할을 명시합니다. 전체 프롬프트는 academy-prompt.txt, 결과 원본은 academy-source.png입니다. 페인팅은 기준 도형을 참조한 표현이며 모든 픽셀이 수학적 투영을 보장하는 데이터는 아닙니다.

## 게임 등록

`scripts/build-magic-school-art.cjs`는 v3만 읽어 기존 academy-2d.png에 등록합니다. 1280×1152, 기준점 (640,1088), 실루엣 폭 최대 1088px, 기존 LUT 팔레트, 이진 알파, 균일 축소입니다. 이전 v1/v2는 보존 자료입니다. 기존 학교 배치·충돌·정문 위치를 유지합니다.

최종 확인은 main.tscn/Plaza 기본 카메라의 전체/정문 GPU 렌더입니다. 쿼터뷰는 비교 기능이고 이 정면형 3/4 스프라이트의 승인 기준이 아닙니다. 픽셀별 높이 맵은 도입하지 않았습니다. 브라우저 플레이 확인은 사용자에게 남깁니다.

검수: 실제 main.tscn 기본 카메라 전체·정문 GPU 출력을 확인했습니다. Web 파일 저장 후 종료 리소스 정리 오류가 남아 빌드 명령은 실패 상태입니다. 다만 현재 학교의 가져온 텍스처 전체 바이트가 index.pck 안에 포함됨을 확인했습니다. 브라우저 플레이는 미확인입니다.

조명 추가: lighting.json과 academy-spatial.png 보조 데이터 맵을 사용합니다. R=높이/16, G/B=노멀 X/Y. build-school-lighting.cjs가 만든 구역별 근사 데이터이며 색상 PNG는 수정하지 않습니다. 문 옆 램프 2개·첨탑 창문 4개부터 적용합니다. 그림자 차폐와 높이 기반 가림은 아직 구현하지 않았습니다. local_lighting.gd의 발광 위치·감쇠를 2D 수신 셰이더와 native 3D 광원이 공유합니다. 실제 비교 렌더는 art/reference/local-lighting/입니다.
