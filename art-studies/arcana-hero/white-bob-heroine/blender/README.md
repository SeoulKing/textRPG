# 백발 단발 주인공 · 선택한 후보 2번

원화: 상위 폴더의 `white-bob-candidates-v1.png`, 가운데 2번입니다. `heroine.blend`에 편집용 곡면 메시, 페인트 텍스처, 23개 뼈대, Idle/Walk 액션과 스튜디오가 들어 있습니다. 게임용 GLB는 별도로 28,000삼각형으로 줄였습니다.

저장소 루트에서 `pwsh -File scripts/build-blender-heroine.ps1`로 원본과 게임 모델을 다시 만들 수 있습니다. 모델링 수정 없이 애니메이션/내보내기만 고칠 때는 `-SkipRender`를 사용할 수 있습니다. 생성기를 다시 실행하면 출력 원본이 교체되므로 직접 편집한 변형은 다른 이름의 .blend로 보존합니다.

Godot 모델은 `godot-arcana/art/models/heroine/heroine.glb`, 어댑터는 `godot-arcana/scripts/blender_hero.gd`입니다. 어댑터의 색 보정광과 공통 도트 렌더러를 통해 실제 게임 크기의 가독성을 확인합니다. Blender 확대 렌더와 게임 조명·해상도를 구별합니다.
