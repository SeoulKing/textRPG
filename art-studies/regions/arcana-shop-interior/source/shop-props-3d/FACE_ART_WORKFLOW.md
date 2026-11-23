# 아르카나 가구 면별 제작 방식

[카운터 전개도 시안](counter-face-concept.png)과 [정확한 치수의 SVG 전개도](counter-face-layout.svg)가 첫 예시입니다. 시안은 디자인 검토에 쓰고, SVG는 면의 치수와 접히는 위치를 정하는 데 씁니다.

1. 기존 가구의 폭·깊이·높이를 확인하고 원본 픽셀 치수를 정합니다. 1 월드 단위는 64px입니다. 카운터 4×1×1의 경우 앞·뒤·위·아래가 각각 256×64px, 좌·우가 각각 64×64px입니다.
2. 네 세로 면은 왼쪽–정면–오른쪽–뒷면 순서로 이어 놓습니다. 윗면은 정면 위에, 밑면은 정면 아래에 붙입니다. 각 면은 그 면을 바로 바라본 직각 투영으로 그립니다.
3. 전개도에서 이웃하는 변의 색과 테두리 두께를 맞춥니다. 카운터는 위아래 목재 띠가 네 세로 면을 잇고, 상판의 길이 방향 나뭇결과 황동 모서리가 이어집니다. 정면에 남색 별자리 장식, 뒷면에 서랍, 양옆에 목재 패널을 둡니다. 상판은 비워 둡니다.
4. 디자인이 확정되면 PixelPen에서 면별로 그려 저장·재열기하고 PNG를 출력합니다. 카운터처럼 면이 평평한 가구는 Godot에서 각 그림을 해당 면에 맞춰 붙입니다. 카메라의 투영은 씬에서 적용합니다. 45° 화면에서 보이는 약 45px 높이와 깊이는 제작 원본의 64px와 구별합니다.
5. 기존 45° 직교 화면에서 맞닿는 변과 접지를 확인합니다. 회전 편집이 필요한 경우 양옆과 뒷면의 방향도 함께 확인합니다.

원점은 전개도 내용의 왼쪽 위입니다. 아래의 `W`, `D`, `H`에는 원본 픽셀 기준의 폭·깊이·높이를 넣습니다.

| 면 | 시작 좌표 | 크기 | 그림 읽는 방향 |
| --- | --- | --- | --- |
| 왼쪽 | `(0, D)` | `D×H` | 왼쪽에서 오른쪽으로 뒷면 → 정면 |
| 정면 | `(D, D)` | `W×H` | 왼쪽에서 오른쪽으로 가구 왼쪽 → 오른쪽 |
| 오른쪽 | `(D+W, D)` | `D×H` | 왼쪽에서 오른쪽으로 정면 → 뒷면 |
| 뒷면 | `(2D+W, D)` | `W×H` | 왼쪽에서 오른쪽으로 가구 오른쪽 → 왼쪽 |
| 윗면 | `(D, 0)` | `W×D` | 위에서 아래로 뒷면 → 정면 |
| 밑면 | `(D, D+H)` | `W×D` | 위에서 아래로 정면 → 뒷면 |

## 첫 카운터의 모따기

카운터 상판의 앞쪽과 양끝에서 각각 3px만큼 들어가고, 만나는 세로 면을 같은 높이만큼 낮춥니다. 두 경계를 얇은 사선 면으로 잇습니다. 뒤쪽 상판 경계는 직각으로 둡니다. 사선 길이는 약 4.24px이므로 별도의 4px 폭 띠로 나뭇결과 밝은 가장자리를 그립니다.

카운터 아틀라스는 640×200px입니다. 전개도의 여섯 면 아래에 모따기 띠를 놓습니다. 띠의 `(0, 192)`에 정면 256×4px, `(256, 192)`에 왼쪽 64×4px, `(320, 192)`에 오른쪽 64×4px을 둡니다. 세 띠는 각각 상판에서 아래쪽 세로 면으로 이어지도록 채색합니다.

첫 카운터는 상판을 비운 상태로 별도 씬에 조립했습니다. PixelPen 원본을 다시 열어 같은 픽셀로 출력되는 것을 확인했고, Godot의 정면 하향 45° 직교 카메라로 렌더링했습니다. [PixelPen 원본](../../../../../godot-arcana/art/source/shop-counter-face-v1/counter.pxpen) · [PNG 아틀라스](../../../../../godot-arcana/art/export/shop-counter-face-v1/counter.png) · [카운터 씬](../../../../../godot-arcana/scenes/props/shop/furniture/counter_face_3d.tscn) · [45° 렌더](../../../../../godot-arcana/art/reference/shop-counter-face-v1/counter-45.png)

카운터 시안은 내장 ImageGen으로 제작했습니다. SVG에서 출력한 배치 가이드를 편집 대상으로, 기존 아르카나 가구 시안을 재질 참조로 사용했습니다. 두 보관 타일셋은 픽셀 밀도와 재질의 참고 입력으로 사용했습니다.

## 정면과 윗면을 쓰는 선반

상점 뒷줄의 선반은 2×0.5×3 월드 단위입니다. 승인 시안의 윗면을 128×32px, 정면을 128×192px로 옮겨 한 아틀라스에 배치했습니다. PixelPen에서 두 면과 반사광 보정 레이어를 편집할 수 있습니다. 약초 묶음과 가죽 결, 유리병 반사를 게임 크기에서도 구분할 수 있게 작은 명암과 장식을 살렸습니다. [승인 시안](cabinet-face-concept-v2.png) · [PixelPen 원본](../../../../../godot-arcana/art/source/shop-cabinet-face-v2) · [상점 45° 렌더](../../../../../godot-arcana/art/reference/shop-cabinet-face-v2/cabinets-in-shop-45.png)

<details>
<summary>카운터 시안에 사용한 프롬프트</summary>

```text
Paint finished concept-art surfaces into the six existing rectangles of the first image, a precise unfolded box net for the Arcana shop checkout counter. Treat the FIRST input as the edit target and geometry template. Preserve its flat navy background, title, labels and all six rectangles at their exact positions, dimensions, and shared edges. Keep its landscape composition. The order across the horizontal row is LEFT, FRONT, RIGHT, BACK. TOP touches the upper edge of FRONT and BOTTOM touches its lower edge. The four long rectangles have width-to-height 4:1; the side faces are exactly square. Paint artwork ONLY inside these rectangles; maintain the rectangle silhouette, no bleed outside. Each face is drawn as a perpendicular, straight-on orthographic texture view from its own direction, on one single flat plane. No perspective, no folds visible, no vanishing points, no extra angled preview, no characters or room. Show the bare furniture only: top surface completely clear with NO objects, no scales, no ledger, no bottles, no trays, no decorations sitting on the wood.

The top face is clear honey-brown walnut with three fine lengthwise plank seams and subtle grain running along the long direction; restrained aged-brass flush corner fittings and thin rounded-looking golden-brown wood trim just inside its edge. FRONT (the second face in the row) has a carved walnut frame, thin brass line, two stiles at the ends and a single large inset dark ink-indigo celestial panel with a central eight-point gold star, a handful of small restrained constellation dots and lines. All ornament is painted flush on the front and contained within its frame. LEFT and RIGHT are understated dark walnut with one matching inset wood panel each, no stars; carry the same top and bottom rail heights continuously across all four upright faces. BACK is the merchant's side: plain warm walnut with two modest inset drawer faces and recessed small brass pulls, closed and flush. BOTTOM is shaded dark brown plain wood with four modest square pad marks near the corners, no decor; it remains a full rectangular face.

Use refined crisp pixel art material, small deliberate pixel clusters, clear but gentle grain, controlled golden highlights. Physically consistent furniture joinery across the adjacent face borders. No letterforms inside any painted rectangle. Keep the labels and size figures outside them exactly as supplied. Keep the concept as a single polished six-face sheet. The SECOND image is the previously approved Arcana collection for color and counter identity; reference only its walnut, deep navy and brass panel language. The third and fourth are analysis-only pixel art scale/material references and must not be copied. The first image controls the net entirely.
```

</details>
