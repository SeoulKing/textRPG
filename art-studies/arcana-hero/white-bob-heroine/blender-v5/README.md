# V5 · 승인 시안 기반 얼굴/머리카락 3D 원본

현재 편집 원본은 `heroine-v5-head.blend`입니다. 사용자 승인 시안은 `approved-concept.png`, `review/`의 비교판과 회전 영상은 실제 모델의 Blender 출력입니다. 얼굴과 머리카락부터 제작한 흉상이며, 전신·표정 리깅·보행 완성본으로 보고하지 않습니다. 게임에 적용하지 않았습니다.

## 얼굴과 머리카락

초기 파라메트릭 얼굴을 그대로 완성본으로 삼지 않고, CC0로 공개된 pixiv의 Sendagaya Shino 얼굴 토폴로지를 기초로 새 비례를 맞췄습니다. 눈 주변 높이, 턱 폭과 코/입의 인상, 입꼬리를 수정하고 홍채를 보라색으로 조정했습니다. 피부·귀·코·눈썹·속눈썹 재질을 따로 보정했습니다. 원래 샘플의 캐릭터 이름·머리·의상·몸·애니메이션을 현재 캐릭터 디자인으로 채택하지 않았습니다.

단발은 직접 작성한 28개 큰 입체 머리카락 메시와 두상 안쪽 바탕, 가는 곡선으로 구성했습니다. 비대칭 가르마, 귀를 드러내는 배치, 아래쪽의 퍼지는 볼륨을 조정했습니다. `textures/pearl-hair-atlas-v1.png`는 승인 시안을 머릿결 색/붓결 참고로 사용해 imagegen으로 제작한 실제 UV 알베도입니다. 각 입체 덩어리에 다른 영역을 연결하고 대비를 낮췄습니다. 컨셉 그림을 정면 판에 붙여 머리를 대체한 결과가 아닙니다.

얼굴 토폴로지와 그림/질감의 출처를 숨기지 않습니다. 직접 수정한 메시·재질·UV는 .blend에 있고 원본 다운로드·메타데이터·해시는 `reference-topology/`에 보존했습니다.

## 파일과 확인 자료

- `heroine-v5-head.blend`: 현재 편집 원본. 얼굴·눈·귀·목·머리카락·보조 숄/옷깃, 패킹된 텍스처와 편집기용 승인 이미지가 들어 있습니다.
- `heroine-v5-head-blockout.blend`: 초기 독자 얼굴/헤어 조형 보존본. 현재 얼굴로 취급하지 않습니다.
- `heroine-v5-head-artist-topology.blend`: 재조형/UV 제작 중간 원본. 수동 수정은 현재 편집 원본에 합니다.
- `review/reference-vs-model-v5.png`: 승인 시안과 실제 모델의 사선 비교. 시안의 고개 기울기·표정·포즈는 중립 모델과 다릅니다.
- `review/model-angles-v5.png`: 같은 메시의 정면·사선·측면과 재질을 제거한 회색 조형 렌더.
- `review/head-turntable.gif`: 같은 모델을 24방향으로 회전한 실제 렌더. 생성 이미지를 회전시키거나 동영상으로 바꾼 결과가 아닙니다.
- `model-inspection.json`: 저장 원본의 메시 목록. 메시 수는 미적 완성도 지표가 아닙니다.

시안과 완전히 동일한 미술 품질이라고 주장하지 않습니다. 특히 잔머리 끝의 가벼운 움직임, 얼굴의 세밀한 표정과 붓결은 실제 비교판에서 계속 판단해야 합니다. 원본 모델·오프라인 렌더·사용자의 미술 승인은 별개입니다.

## 편집과 재출력

Blender 4.5.15 LTS로 열 수 있습니다. 정면 -Y, 위 +Z, 턱 근처 Z=0의 독립 제작 단위이며 게임96×136/접지 좌표를 변경한 것이 아닙니다. 승인 이미지는 편집기 전용 Empty로 들어 있고 렌더에는 나오지 않습니다.

수동 편집 후 아래 명령은 저장 원본을 읽어 검토 화면만 출력합니다. .blend를 저장하거나 재구성하지 않습니다.

```powershell
pwsh -NoProfile -File scripts/run-blender-heroine-v5.ps1 -Script scripts/blender/review_heroine_v5_head.py
python scripts/package-heroine-v5-review.py
```

최초 제작 레시피는 `build_heroine_v5_head.py`(blockout) → `fit_heroine_v5_face.py`(CC0 토폴로지 피팅) → `paint_heroine_v5_hair.py` → `refine_heroine_v5_hair_paint.py` 순서입니다. 현재 편집 원본을 재생성하는 일상 출력 절차가 아닙니다. 기존 원본이 있으면 제작 스크립트는 중단하며, 최초 제작을 다시 할 때만 명시적 재구성 옵션을 사용합니다. 수동 수정이 있는 현재 원본을 중간 파일로 자동 교체하지 않습니다.

## 외부 얼굴 토폴로지 출처

- 원작자: pixiv Inc. / VRoid Project, Sendagaya Shino.
- 공식 CC0 안내: https://vroid.pixiv.help/hc/en-us/articles/360013482714-Sendagaya-Shino
- 다운로드: https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sendagaya_Shino.vrm
- 파일 자체의 VRM 메타데이터 `licenseName: CC0`도 확인했습니다. 일반 VRoid 샘플 전체가 CC0라고 가정하지 않았습니다.
- 이 흉상의 수정 내용: 얼굴 비례 피팅·눈 영역 변형·턱 폭·입꼬리·보라색 눈·피부/코/귀/눈썹 재질 보정. 기존 샘플의 머리카락과 몸·옷은 사용하지 않았습니다.

원본 V3/V4와 다른 대화의 스프라이트·공유 Godot/Web 파일을 보존했습니다. 이번에는 오프라인 미술 제작/검토만 수행했으며 게임 가져오기·웹 배포·브라우저 조작·자동 플레이는 하지 않았습니다.
