# V5 미술 방향 · 사용자 승인 컨셉

사용자는 V4 외형을 거절하고 원신처럼 아름다운 캐릭터와 제2의 나라 제작 방법을 요청했습니다. 기존 V4를 최종 품질로 취급하지 않습니다. 3D 게임 반영 보류는 계속 유지합니다.

## 이번 산출물

`concept-v1.png`는 imagegen으로 생성한 동일 캐릭터의 미술 방향 참고 이미지 한 장입니다. 실제 Blender 모델·실시간 렌더·3D 변환 결과가 아닙니다. 원본 백발 단발·보랏빛 눈·하늘색 숄·상아색 드레스·남색 리본·회갈색 부츠를 참조했습니다. 얼굴/비례 재설계 후보이며 자동으로 확정 디자인을 교체하지 않습니다.

이미지는 좀 더 길고 가는 전신 비례, 작은 턱과 세련된 눈꺼풀, 겹쳐 흐르는 단발, 얇은 천과 정리된 주름을 제안합니다. 가는 잔머리와 자수의 모든 선이 저해상도에 남는다고 가정하지 않습니다. 모델 제작 전에 정면·측면 치수와 원본/작은 화면에서의 실루엣을 고정해야 합니다.

## 현 후보 진단과 제작 방향

V4는 평평하게 보이는 얼굴, 단순한 눈꺼풀·턱선과 두꺼운 머리카락 덩어리가 약점입니다. 리깅 수치와 머리 각도 검사는 외형의 매력을 보증하지 않습니다. 사용자 승인 후 별도 V5 모델에서 얼굴·눈꺼풀·측면 코/입술/턱선을 실제 메시로 조형하고, 큰 머리카락 흐름과 얇은 끝을 설계합니다. 정면·사선·측면에서 같은 인상인지 확인한 다음 몸과 의상, 표정, 움직임 순서로 진행합니다. V4의 메시 수치 조정만 반복해 완성으로 보고하지 않습니다.

캐릭터용 비사실적 렌더링(NPR)은 얼굴 그림자 제어, 머리카락 하이라이트와 재질별 명암을 함께 설계합니다. 이는 이번 작업의 제안이며 아래 게임들의 비공개 구현과 동일하다고 주장하지 않습니다. 최종 도트 출력에서는 큰 눈매·머리 덩어리·허리와 치마의 경계를 우선합니다. 게임 연결이나 새 셰이더는 이번 컨셉 단계에서 수정하지 않았습니다.

## 1차 자료 조사

- GDC 2021 원신 제작자 발표: https://gdcvault.com/play/1027539/-Genshin-Impact-Crafting-an
- 해당 발표 슬라이드: https://media.gdcvault.com/GDC%2B2021/2021GDC%2B_%2BHaoyu%2BCai%2B_%2Bpresentation%2Bfile.pdf
  공식 검색 색인에서 Model & Texture, Face dynamic lightmap, 캐릭터/장면 렌더 파이프라인 분리, 인위적 그림자 제어를 확인했습니다. PDF 본문 열기는403으로 차단되어 본문/영상 전체를 열람한 것으로 보고하지 않습니다.
- Epic Games의 넷마블 개발진 인터뷰(2022-07-06): https://www.unrealengine.com/developer-interviews/ni-no-kuni-cross-worlds-pushes-the-boundaries-of-what-a-mobile-mmorpg-can-be?lang=en-au
  개발진은 전통적인 카툰 셀 셰이딩, 반복적인 디자인·렌더·수정, 성격에 맞는 표정 포즈, bone control을 통한 동작 연결과 후속 움직임, 뼈 크기 기반 체형 커스터마이징 및 UV/텍스처 마스크 염색을 설명합니다. 특정 얼굴 노멀/SDF 구현을 사용했다는 내용은 이 인터뷰에서 확인하지 않았습니다.

## 다음 단계의 조건

arcana-2d-art/SKILL.md의 새 미술 컨셉 승인 절차에 따라 이 한 장의 얼굴과 비례를 사용자에게 보여드립니다. 이후 사용자가 이 시안을 명시 승인하고 얼굴과 머리카락부터 실제 모델로 제작하도록 요청했습니다. 새 원본은 ../blender-v5/에 분리합니다. 게임 적용 금지는 유지합니다. 기존 원본과 다른 대화의 스프라이트·게임 작업은 보존합니다.

생성 기록: imagegen built-in, stylized-concept. 원본 이미지: ../heroine-pixel-gameplay-target-v1.png. 출력 방향: premium anime cel-shaded 3D-style character art-direction sheet; same white-bob/violet-eye heroine; refined eyelids, tapered jaw, slim silhouette, flowing bob locks, thin ivory/periwinkle cloth; full body + face close-up + side view; not an actual mesh screenshot. 검토용 미술 이미지이며 생성 모델의 수행 능력과 실제 3D 제작 품질을 혼동하지 않습니다.

## 사용자 승인 후속

“ㅇㅇ 이 시안대로 만들어줘. 그림만 이쁘고 실제 모델은 또 다르게 나오지 않게 얼굴이랑 머리카락부터 제대로 만들어봐. 게임에는 아직 적용하지 말고”를 제작 지시로 고정합니다. 컨셉 승인은 실제 모델 결과의 승인을 뜻하지 않습니다.
