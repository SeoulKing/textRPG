# Project Lessons

다음 작업의 도구 선택을 바꾸는 항목만 유지합니다.

| 범위 | 관찰 또는 실패 지문 | 다음 결정 | 재검토 조건 |
| --- | --- | --- | --- |
| Content Studio runtime source | Published Studio data can come from the configured database and differ from the tracked `content/content-studio.json` seed. | Test Studio synchronization with an injected or loaded published registry; do not treat the local seed as evidence of the live value. | Reconsider when deployment no longer uses `PostgresContentStudioStore` or published data is exported back into the tracked seed. |
| 사용자 선호 | 실패한 방법을 반복하면 토큰과 시간이 낭비됩니다. | 같은 실패 지문은 전제 조건 변화 없이 재시도하지 않고, 필요한 최소 검증만 수행합니다. | 사용자가 더 강한 검증이나 재시도를 명시적으로 요청할 때 |
| 재고 노드 설계 | 사용자는 내용물이 비어도 남는 보관함과, 모두 수집하면 장소·진입 선택지가 사라지는 더미를 서로 다른 종류로 봅니다. | 보관함은 `depletionBehavior: "remain"`을 유지하고, 소진 시 사라질 더미에만 `"disappear"`를 지정합니다. | 사용자가 재생성·리필되는 세 번째 재고 노드 유형을 요구할 때 |
| Git 게시 | 사용자는 이 저장소에서 GitHub CLI 대신 기존 Git HTTPS 인증으로 현재 브랜치에 직접 커밋·푸시하는 방식을 선호하며, 이 경로는 정상 동작합니다. | 푸시 요청 시 실제 프로젝트 변경만 명시적으로 스테이징하고 `.codex-local-server.*.log` 같은 런타임 로그는 제외한 뒤 `git commit` 및 `git push -u origin <현재 브랜치>`를 사용합니다. PR은 명시 요청 때만 생성합니다. | HTTPS Git 인증이 실패하거나 사용자가 PR 생성을 명시적으로 요청할 때 |
| 로컬 콘텐츠 검증 | 일반 셸에서는 `npm.cmd`가 PATH에 없고, 번들 `pnpm.cmd`는 번들 Node 경로를 PATH에 추가해야 실행됩니다. `tsx`가 `uv_os_get_passwd returned ENOMEM`으로 중단되어도 번들 Node로 `tsc` 컴파일 후 생성된 `game/data/registry.js`의 `validateContent()`를 직접 호출하는 경로는 정상 동작합니다. | `tsx`의 같은 `ENOMEM`을 반복하지 않고, `.tmp-validate` 아래로 컴파일해 콘텐츠 검증과 필요한 로직 스모크 테스트를 실행합니다. | 셸 PATH가 정상화되거나 새 런타임에서 메모리 오류 없이 `tsx`가 실행될 때 |
| 브라우저 검증 | 현재 `package.json`에는 Playwright 의존성이 없어 독립 Playwright 스크립트가 `ERR_MODULE_NOT_FOUND: playwright`로 실패하고, Chrome headless/CDP는 관리형 셸의 프로세스 권한과 페이지 타깃 시작에 좌우됩니다. 반면 Codex의 열린 인앱 브라우저는 Browser 플러그인의 `browser-client`로 연결·조작·실측이 확인되었습니다. | 사용자가 열어 둔 로컬 화면 검증은 인앱 브라우저 탭을 연결해 새로고침하고, 내장 Playwright API로 DOM·치수·화면을 한 세션에서 확인합니다. 독립 Playwright나 Chrome 프로세스를 관성적으로 재호출하지 않습니다. | 인앱 브라우저 연결 자체가 실패하거나 사용자가 Chrome/독립 실행 환경을 명시할 때 |
