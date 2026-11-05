# pixelfx 파이어볼 비행 효과

- 원본: https://github.com/patch-gg/pixelfx, commit `a84159688af3ca37a4be05a0d422b94451b2e24e`, `fire/fireball`.
- Patch 및 Hugo Duprez의 MIT 라이선스와 고지는 이 폴더에 보존합니다. 배포 시 라이선스도 함께 제공합니다.
- 원본 명령: `node tools/render.mjs fire/fireball --sheet`. 136×56 프레임 36장, 30fps, 반복, 4열, 머리 기준점 (112, 28).
- 게임 시트: `art/export/effects/pixelfx-fireball.png`. 현재 2D `native_2d_flame.gd`에서 비행에 사용하며 기존 명중·소멸 효과와 캐릭터 시전은 유지합니다.
- 게임 실행 화면 및 미술 승인은 아직 확인하지 않았습니다.

- 명중 효과: 같은 커밋의 `explosions/small-explosion`을 15fps로 출력한 뒤 앞 18프레임(1.2초)을 `art/export/effects/pixelfx-impact.png`에 사용합니다. 원본 300×240, 9열, 기준점 (150,196)을 유지하고 마지막 0.25초에 페이드합니다. 기존 빗나감과 메테오 연출은 유지합니다. 원본 메타데이터는 `impact-source.json`입니다.
