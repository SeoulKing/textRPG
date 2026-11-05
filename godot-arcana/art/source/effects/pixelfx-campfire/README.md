# 설치형 PixelFX 모닥불

사용자가 2026-11-02에 새 생성 시안 대신 기존 PixelFX 캠프파이어 사용을 지정했습니다. 원본 그림과 프레임을 다시 그리지 않고 그대로 재사용하며 표시 위치와 조명만 아르카나에 맞춥니다. 기존 여관 벽난로 효과는 변경하지 않습니다.

- 출처: https://github.com/patch-gg/pixelfx fire/campfire, commit a84159688af3ca37a4be05a0d422b94451b2e24e, Patch 및 Hugo Duprez, MIT. 동봉 LICENSE.txt를 보존합니다.
- 원본: art-studies/pixelfx-preview/fire/campfire/campfire.png 및 같은 폴더 JSON. 출력 atlas는 원본 PNG의 무변경 복사본입니다.
- 출력: godot-arcana/art/export/effects/pixelfx-campfire.png, 6열×6행, 셀 128×128, 36프레임·12fps 반복.
- 등록: native_2d_campfire.gd, 원본 pivot (64,112), 노드 Scale (1,1), nearest. 논리 좌표를 native_2d_coordinates의 4 source px/논리 px로 변환합니다.
- 점유: 논리 좌표 반경 10의 이동 충돌. 배치는 중심에서 ±8의 지형 여유와 모닥불끼리 중심 간격 20을 확인합니다.
- 효과 끄기·모션 감소에는 첫 프레임을 유지하고 동적 조명만 끕니다. 새 캐릭터 동작·장작 그림·PixelPen 프레임 수정은 없습니다.
- 품질은 저장된 제작 결과이며 배치할 때 다시 추첨하지 않습니다. 성능은 서버의 life.ts에서 관리합니다.
- 미술 참조: STARDEW_PROJECTION_GUIDE.md의 보관 참조 및 기존 아르카나 환경. 이번 변경은 새 공간 그림 생성이 아닌 사용자 지정 기존 효과의 재사용입니다.