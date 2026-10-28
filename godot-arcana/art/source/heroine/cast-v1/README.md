# Fireball cast v1

사용자가 `approved-concept.png`의 준비 → 응축 → 발사 → 회복을 승인했습니다. 백발 단발·보랏빛 눈·하늘색 숄·상아색 드레스·회갈색 부츠를 유지합니다. 내장 image_gen으로 생성한 `cast-sheet-source.png`는 마지막 줄의 여분 손을 지적받아 다시 생성한 원본입니다. `frames/`는 등록된 개별 편집 PNG입니다.

`python scripts/package-heroine-cast.py`는 원본의 4열×8행을 96×136, 발 (48,116), 기존 달리기와 같은 32색·이진 알파로 등록합니다. 뒤를 바라보는 NW를 지키기 위해 NE를 반전하고 W/SW도 E/SE의 반전을 사용합니다. 런타임 텍스처는 `art/export/heroine-cast-v1/heroine-cast.png`이며 기존 달리기 원본은 보존합니다.

`heroine_run.gd`의 시전 자세와 `arcana_spatial.gd`의 .32초 준비 타이밍을 공유합니다. 준비 중 이동은 잠시 멈추고 발사 때 현재 위치·고정한 공격 방향으로 기존 서버 명령을 한 번 보냅니다. 발사 후 .36초간 후속 자세를 표시합니다. 자동 조준·수동 조준의 공격 방향은 월드 방향으로 유지하며 카메라에 맞는 8방향 셀을 고릅니다. 응축 효과는 `fireball_charge.gdshader`의 96도트·64px/단위 평면이며 기존 불꽃 색과 국소 광원을 따릅니다. 일시정지·취소·효과 끄기·동작 줄이기를 반영합니다.

기본 의상에 시전 시트를 사용하며 다른 장비 조합은 기존 Blender 렌더러와 방향 전환을 유지합니다. 다른 장비용 신규 시전 원화는 포함하지 않습니다.

웹 산출물: `scripts/export-fixed-legs.ps1 -StagePath .runtime/godot/fireball-cast-v1-stage`. 오프라인 장면 출력: `scripts/render-fireball-cast.ps1`. 실제 플레이와 저장 데이터 변경을 수행하는 도구가 아닙니다.
