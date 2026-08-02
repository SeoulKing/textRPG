# 요리 목록 밀도 개선 Design QA

## 비교 대상

- source visual truth path: 인앱 브라우저 캡처 `cookingAfterPng` (이전 요리 목록)
- implementation screenshot path: 인앱 브라우저 캡처 `cookingSecondRenderedReady` (간격·칩·복귀 항목 개선 후)
- viewport: 325 × 631 CSS px
- source pixels: 325 × 631 px
- implementation pixels: 325 × 631 px
- CSS size / density normalization: 동일한 viewport와 동일한 브라우저 캡처 배율을 사용했으므로 별도 보정 없음
- state: 임시 거처의 요리 메뉴, `따뜻한 식사` 레시피가 선택된 상태

## Full-view comparison evidence

- 레시피 선택 행의 세로 패딩을 8px에서 4px로 줄여 행 높이가 42px에서 34px로 감소했습니다.
- `조건`, `필요 재료` 텍스트는 화면에서 제거하고 조건·재료를 동일한 칩 흐름으로 합쳤습니다.
- 가장 많은 칩을 가진 `따뜻한 식사`도 정확히 두 줄에 모두 표시됩니다.
- 상세 패널의 `scrollWidth`와 `clientWidth`가 모두 284px로 같아 가로 스크롤이나 잘림이 없습니다.
- `거처로 돌아가기`는 34px 높이, 흰색 배경, 0px radius, 얇은 하단선으로 레시피 목록과 같은 시각 체계에 들어갔습니다.
- 다섯 레시피와 복귀 항목이 325 × 631 화면에 모두 보입니다.

## Focused region comparison evidence

- 전체 캡처에서 레시피 상세 칩과 여섯 개 목록 행의 간격·경계·텍스트가 판독 가능해 별도 확대 비교는 필요하지 않았습니다.

## Findings

- P0: 없음
- P1: 없음
- P2: 없음
- P3: 없음

## Required fidelity surfaces

- Fonts and typography: 기존 글꼴·굵기·크기를 유지해 정보 위계를 보존했고 칩 텍스트도 잘리지 않습니다.
- Spacing and layout rhythm: 요청대로 선택 행의 세로 패딩을 절반으로 줄였으며 목록 사이의 별도 간격은 0px입니다.
- Colors and visual tokens: 기존 흰색 목록 배경, 강조색, 조건·재료 상태색을 그대로 사용했습니다.
- Image quality and asset fidelity: 상단 장면 이미지는 기존 크롭과 품질을 그대로 유지했습니다.
- Copy and content: 조건·재료의 실제 내용은 모두 보존하면서 두 제목만 시각적으로 숨겼고, 화면 읽기 도구용 텍스트는 유지했습니다.

## Primary interactions tested

- `생선구이` 선택 시 상세 제목이 `생선구이`, 효과가 `+3 기력`으로 갱신되는 것을 확인했습니다.
- 다시 `따뜻한 식사`를 선택해 전달 화면의 기준 상태로 복귀했습니다.
- `거처로 돌아가기`에 전용 목록 행 클래스가 유지되는 것을 확인했습니다.

## Console errors checked

- 브라우저 경고·오류 로그를 확인했으며 발견된 항목이 없습니다.

## Comparison history

- 1차 비교: 같은 viewport와 같은 요리 메뉴 상태의 전후 캡처를 하나의 비교 입력으로 확인했습니다. 조치가 필요한 P0/P1/P2 차이가 없어 추가 시각 수정 없이 통과했습니다.

## Implementation Checklist

- [x] 선택 행 세로 패딩 50% 축소
- [x] 복귀 항목을 동일한 목록 스타일로 통합
- [x] 조건·필요 재료 제목 제거
- [x] 칩 전체를 최대 두 줄로 표시
- [x] 가로 스크롤 제거
- [x] 레시피 선택 상호작용 확인
- [x] 브라우저 콘솔 오류 확인

## Follow-up Polish

- 없음

final result: passed
