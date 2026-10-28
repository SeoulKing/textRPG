# 마법학교 · 3/4 RPG v2

현재 상태: 게임 자산 연결, 미술 검토 전. 제작 체계: ../../../RPG_ART_PIPELINE.md.

- 내장 image_gen으로 기존 학교 디자인을 다시 그렸습니다. source 원본은 academy-source.png, 전체 지시는 academy-prompt.txt입니다.
- 목표 시점: 기본 정면형 3/4 RPG, yaw 0°, 하향각 45°, 정사영. 이전 v1의 거의 수평 입면도 지시는 사용하지 않습니다. 2D 생성화는 투영 목표에 맞춘 근사 표현이며 수학적 정합을 보장하지 않습니다.
- 푸른 지붕, 상아색 돌, 두 첨탑, 별·책 표식, 오른쪽 천문대·망원경을 유지하고 지붕 윗면, 처마 윗면, 계단 깊이를 다시 그렸습니다.
- 캔버스 1280×1152, 투명 여백 포함. 실루엣 폭 1088px = 17단위×64px, 발/문턱 기준 (640,1088). 세로 비균등 늘리기 없이 균일 축소합니다.
- scripts/build-magic-school-art.cjs가 분리된 생성 잡티 제거, 이진 알파, 공통 LUT 팔레트 변환과 등록을 수행합니다. 제작 비교판 scale-overview.png, entrance-detail.png와 manifest.json을 함께 생성합니다.
- 게임용 파일: godot-arcana/art/export/reference/academy-2d.png. runtime의 위치 (12,0,9.5), 충돌 [-8.5,-4,17,4], 정문 기준점과 기존 학교는 유지합니다. 새 실내나 입장 동작은 만들지 않습니다.
- 높이 맵은 없습니다. 기존 정문 기준 전체 자산 가림을 사용하므로 복잡한 건물 내부 깊이는 해결하지 않습니다. 향후 color/height 짝과 지면 오프셋으로 확장합니다.
- scripts/render-magic-school.ps1은 실제 main.tscn/Plaza에서 전체·정문 앞·뒤를 오프라인 출력합니다. 브라우저 플레이 확인과 구별합니다.
- 사용자 확인: 새로고침 후 북쪽 포탈 왼편 학교의 정문·지붕·양옆 접지 확인. 카메라 기본 정면을 사용합니다. 이전 assets-v1과 원래 3D 학교는 보존합니다.

확인 완료: Godot import/Web export 및 실제 main.tscn 기본 카메라 GPU 출력. godot-arcana/art/reference/magic-school/school-overview-front.png와 school-entrance-front.png에서 전체·정문 접지를 확인했습니다. 브라우저 플레이는 확인하지 않았습니다.

이후 고정 투영 도형을 참조한 ../assets-v3/로 교체했습니다. v2는 보존 원본입니다.
