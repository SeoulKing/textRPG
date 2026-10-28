# 실제 모델 UV 텍스처 · imagegen 내장 도구

이번 호출은 CLI가 아닌 내장 imagegen을 사용했습니다. 이미지는 편집 후 수정 없이 프로젝트에 복사했으며, 배치/대비/크기 조절은 Blender UV와 재질에서 처리했습니다.

## skin-cel-v6.png

편집 대상: ../.. /blender-v5/reference-topology/F00_000_Face_00.png. 같은 토폴로지용 피부 UV 지도입니다. 승인 시안은 색·화풍 참고로 전달했습니다.

프롬프트: Keep exact square face UV island silhouette, blank eye socket positions, nose/mouth positions and ear islands. Repaint only skin as luminous light peach ivory, restrained rose cheek blush and gentle warm eyelids. Remove dark vertical nostril stroke and muddy orange contouring; add tiny warm cream reflected nose highlight at the same coordinates. Tiny muted rose closed smile, softly peach/rose ears. No added eyes/brows/lashes/hair/portrait. Deliver the unwrapped skin UV map.

## iris-cel-v6.png

편집 대상: V5 reference-topology/F00_000_EyeIris_00.png. 원래 가로2:1의 두 홍채 위치를 유지합니다. 승인 시안은 보랏빛 눈의 화풍 참고입니다. 배경은 실제 투명으로 생성했습니다.

프롬프트: Preserve the exact2:1 canvas and two oval iris silhouettes at quarter/three-quarter width and half-height on transparency. Repaint inside as hand-painted violet anime irises: dark plum upper arc, lilac/periwinkle lower iris, fine radial fibers, restrained small vertical pupil, rose-violet/blue flecks, one tiny crisp warm-white upper-left reflection and a tiny lower sparkle. No orange/yellow fire blob, huge glossy circles, sclera, eyelids, lashes, face or labels.

## hair-longitudinal-v6.png

새 UV 알베도이며 인물 그림을 입력하지 않았습니다.

프롬프트: Entire square canvas is a flat close-up of fine long parallel vertical pearl-white hair fibers, filling every pixel. Nearly straight thin strokes; actual3D geometry supplies all curves. Light ivory-white base#EEE9EF, delicate low-contrast lavender-grey parallel strand lines, long narrow white brush highlights. Hand-painted matte anime game hair albedo. No branching, feathers, braids, leaf shapes, triangular patches, outer silhouettes, roots/parting/whorl, character or labels.

각 호출 원본의 정규화 UV를 사용했습니다. 출력 픽셀 크기와 투명도는 delivery.json에 기록합니다. 머릿결은 전체 폭을 한 가닥에 반복하지 않고 작은 영역과 가닥 자체의 넓은 색 덩어리를 혼합합니다.
