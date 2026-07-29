# Project Lessons

다음 작업의 도구 선택을 바꾸는 항목만 유지합니다.

| 범위 | 관찰 또는 실패 지문 | 다음 결정 | 재검토 조건 |
| --- | --- | --- | --- |
| 사용자 선호 | 실패한 방법을 반복하면 토큰과 시간이 낭비됩니다. | 같은 실패 지문은 전제 조건 변화 없이 재시도하지 않고, 필요한 최소 검증만 수행합니다. | 사용자가 더 강한 검증이나 재시도를 명시적으로 요청할 때 |
| Git 게시 | 이 저장소는 `gh` 없이 기존 Git HTTPS 인증으로 정상 푸시됩니다. | 사용자가 푸시를 요청하면 관련 파일만 명시적으로 스테이징하고 `git commit` 후 `git push -u origin <현재 브랜치>`를 사용합니다. | HTTPS Git 인증이 실패하거나 사용자가 PR 생성까지 요청할 때 |
| 브라우저 검증 | 현재 `package.json`에는 Playwright 의존성이 없어 번들 웹 게임 클라이언트가 `ERR_MODULE_NOT_FOUND: playwright`로 실패하며, 인앱 브라우저 초기화도 `Cannot redefine property: process`로 실패합니다. 설치된 Chrome의 headless/CDP 경로는 동작이 확인되었습니다. | Playwright와 인앱 브라우저를 관성적으로 재호출하지 않습니다. 화면 검증이 꼭 필요하면 의존성을 추가하지 않고 임시 Chrome 프로필의 headless/CDP 한 세션으로 DOM·화면·오류를 묶어 확인합니다. | 저장소에 정상 동작이 확인된 Playwright 의존성이 추가되거나 인앱 브라우저 런타임 오류가 해결될 때 |
