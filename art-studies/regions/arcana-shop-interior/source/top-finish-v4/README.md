# Upper boundary finish v4

현재 활성 뒷벽은 back-wall-v4.png입니다. 기존 아치 위부터 좌우 끝단까지 이어지는 완결된 상단 코핑을 추가하고 방 크기·배치·점유·카메라는 유지했습니다.

- 원본:back-wall-master.png. 입력 디자인은 기존 back-wall-v2.png이며 boundary-reference.png는 사용자가 제공한 방 경계 구조 참조입니다.
- 제작:node scripts/build-shop-top-finish.cjs. 출력/등록은 상위 manifest.json과 게임용 manifest.json을 따릅니다.
- 활성 출력904×262·발(452,258), 눈에 보이는 벽 폭896px/14월드 단위.
- 상점의 빈 영역은 Color.BLACK. pixel3d_palette.gdshader와 그 생성기 build-arcana-palette.py에서 순수 검정이 팔레트 변환으로 남색이 되지 않도록 보존합니다.
- 다시 내보낼 때는 현재top-finish 빌더 뒤 export-arcana-shop.ps1 → render-arcana-shop.ps1 → promote-arcana-shop.ps1을 사용합니다. 수동 보정 출력은 재제작 전에 보존합니다.
- 가로/세로 실제 게임 정지 렌더에서 상단 마감과RGB(0,0,0) 배경을 확인했으며 브라우저는 조작하지 않았습니다.
