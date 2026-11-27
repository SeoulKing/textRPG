# 여관주인 마르텐
인물 기준은 `approved-concept.png`이며 `innkeeper-source.png`는 이전 생성 원본입니다.
현재 [PixelPen 원본](../../../../art-studies/characters/marten-pixel-v1/marten-concept-colors.pxpen)과 [승인 PNG](../../../../art-studies/characters/marten-pixel-v1/marten-concept-colors.png)는 새 시안에서 추출한 48색을 사용합니다.
`python scripts/package-innkeeper.py`로 승인 PNG를 게임 경로에 등록합니다. 96×136 프레임, 발 (48,116), 64px/단위, 불투명 영역 높이 106px, 최근접 필터, 이진 알파를 사용합니다.
inn_lobby.gd가 접수대 뒤 (16.7,0,5.9)에 표시하고 기존 접수대 깊이가 하체를 가립니다.
world.gd의 접근점 (267,148)은 기존 동선입니다. main.gd의 _innkeeper_dialogue가
인사·여관 안내·길 안내·기존 서버 여관 서비스·대화 종료를 연결합니다.
대화 자체는 상태/보상을 변경하지 않으며 여관 서비스는 기존 서버 선택지를 사용합니다.
현재는 정면 대기 스프라이트입니다. 걷기/방향 전환 애니메이션은 포함하지 않습니다.
