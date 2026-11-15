# pixelfx 여관 벽난로 효과

- 출처: https://github.com/patch-gg/pixelfx `fire/campfire`, commit `a84159688af3ca37a4be05a0d422b94451b2e24e`, Patch 및 Hugo Duprez, MIT.
- 원본을 `node tools/render.mjs fire/campfire --sheet --fps 12`로 출력했습니다. 원본 128×128, 기준점 (64,112), 36프레임 반복입니다.
- 각 원본에서 x=18..109, y=58..111을 잘라 92×54·6열 시트 `art/export/effects/pixelfx-inn-fire.png`에 저장했습니다. 벽난로 그림의 화구 x=90..181, y=155..208에 겹치며 노드 배율은 1입니다.
- 기존 그림과 광원은 유지합니다. 효과 끄기에는 원래 그림을 표시하고 모션 줄이기에서는 첫 프레임을 유지합니다. 게임 화면은 사용자 확인 전입니다.
