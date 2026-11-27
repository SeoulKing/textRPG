# v12 걷기·달리기 모션 출처

원본 BVH는 [ACCAD/The Ohio State University의 Open Motion Project](https://accad.ohio-state.edu/research/motion-lab/mocap-system-and-data)에서 공개한 [Female 1 캡처](https://accad.ohio-state.edu/sites/accad.osu.edu/files/Female1_bvh.zip)입니다. 원본은 [CC BY 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)로 제공됩니다.

- `Female1_B03_Walk1.bvh`에서 왼발 착지 92, 오른발 착지 112, 다음 왼발 착지 130을 사용합니다.
- `Female1_C03_Run.bvh`에서 왼발 착지 8, 오른발 착지 19, 다음 왼발 착지 30을 사용합니다.

두 원본 파일은 그대로 보관합니다. [v12 내보내기](../../../../scripts/export-arcana-hero-v12.py)는 [리타게팅 스크립트](../../../../scripts/blender/hero_mocap.py)로 양쪽 걸음의 위상을 맞추고 전진 변위를 제거합니다. 골반과 팔, 발의 움직임을 v12 뼈대로 옮기고 게임에서 한 주기에 이동하는 거리와 부츠의 밑창에 맞춰 접지를 조정합니다.
