# 모닥불 컨셉 v1

- 상태: 생성 시안은 보류합니다. 2026-11-02 사용자 지시로 기존 PixelFX fire/campfire 원본을 재사용하며, 생성 시안은 게임 자산으로 사용하지 않습니다.
- 기능 계획: 목재 5개로 제작, 품질별 유지 30/45/60분과 굽기 6/4/3초. 물고기는 낚시로만 획득합니다.
- 외형: 돌 테두리 없는 작은 장작더미, 주황·금빛 불꽃, 적은 불티. 캐릭터 동작은 추가하지 않습니다.
- 제작 기준: W 1.25 / D 1 / H 0.9 월드 단위, 정면형 정사영 yaw 0 / 하향각 45 / roll 0, 64 source px/단위. 검토 시안이며 최종 픽셀·등록 규격을 검증한 게임 자산은 아닙니다.
- 생성 도구: 내장 image_gen. 생성 원본은 보존하고 concept-v1.png로 복사했습니다.
- 참조 1: projection.png — 이 대상 치수의 기하 가이드.
- 참조 2: docs/art-reference/stardew-projection/interior-furniture.png — 면 노출·비례·목재 표현.
- 참조 3: docs/art-reference/stardew-projection/outdoors-summer.png — 면 노출·비례·목재 표현.
- 참조 4: godot-arcana/art/reference/projection-lock/front-orthographic-45.png — 공통 투영.
- 참조 5: godot-arcana/art/export/reference/lamp-post-2d.png — 아르카나 화풍·재질·도트 밀도.

## 생성 프롬프트

Use case: stylized-concept. Create ONE design-approval concept image for the Arcana RPG campfire by transforming the placeholder volume in input image 1 into a small wood campfire. Image 1 is the edit target and object-specific projection/size guide ONLY: replace the box entirely, preserve the camera, and remove all guide marks from the final art. Images 2 and 3 are Stardew Valley reference tilesheets for visible top/front planes, readable sprite proportions and timber material treatment ONLY; do not copy their asset designs or reproduce the sheets. Image 4 is the general geometry authority, not a design. Image 5 is Arcana's existing lantern, a style/color-density/detail reference ONLY; do not include a lantern in the output.
Single small campfire, no stone ring: four short thick logs loosely crossed into a stable low heap, readable pale end grain on two ends, deep brown bark, small charcoal and glowing embers within the heap, three connected tapering tongues of orange/red flame with pale golden cores, a few sparse square embers directly above. No rocks, masonry, stove, cauldron, grill, fish, skewers, people, tools, inventory, UI, labels, annotations, border, alternate designs or multiple panels. One campfire only.
CAMERA LOCK: fixed front-facing orthographic RPG camera, yaw 0 degrees, elevation 45 degrees ABOVE horizontal, roll 0. World axes +X right, +Z down, +Y up. No perspective convergence, distance scaling, diamond-isometric grid or 45 degree camera yaw. Show appropriate top surfaces of logs. The whole campfire footprint fits W=1.25, D=1.0 world units, overall H=0.9 including flame. At 64 source pixels/world unit, the footprint is roughly 80 pixels wide by 45 pixels of projected depth. Keep the fire compact, suitable for cooking one fish, flame no taller than the heap's footprint width. Concept image may show the asset enlarged for clear approval, but preserve coherent square pixel clusters as if the actual object were authored in an approximately 128x128 pixel sprite canvas and then enlarged uniformly with nearest-neighbor.
Art direction: refined hand-painted 2D pixel art matching Arcana's illustrated lantern, crisp square pixels, intentionally designed clusters, modest dark material-colored outline, wood in 3-5 broad value steps, warm orange/gold glow, no blurry antialiasing, no photorealism, no 3D render, no noisy microtexture. Neutral deep slate blue background like the guide, a restrained hard pixel contact shadow beneath the logs, no separate ground island or scenery. Center the complete single campfire with generous clean margins. This is a review concept, not a final sprite sheet.