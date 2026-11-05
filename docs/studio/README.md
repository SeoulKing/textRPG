# 아르카나 Codex 제작 조직

사용자님은 게임 방향과 목표를 판단하시고, 제작 총괄은 승인된 목표 안에서 작업 선정·조직 간 요청·통합·인수를 이어갑니다. 장기 목표는 아르카나의 완성이며 첫 공개 목표는 **핵심 체험 공개 시범판**입니다. [출시 로드맵과 제작 계약 초안](RELEASE_PLAN.md)을 먼저 확인해 주세요.

M0 운영 구축은 완료되었으며, 사용자 지시로 **M0-COOK 요리·음식 시스템** 목표를 M1 앞에 추가했습니다. 현재 순서는 M0 → M0-COOK → M1 → M2 → M3 → M4이며, 후속 제작 계약의 상세 범위는 원장에서 확정합니다. 목표 등록은 새 미술·실행 검증·공개 배포 권한을 확대하지 않습니다. 공통 작업 규칙은 [AGENTS.md](../../AGENTS.md), 제작 진입점은 [WORKFLOW.md](../WORKFLOW.md)에 둡니다.

## 책임과 의사결정

| 조직 ID | 책임 | 인수인계 기준 |
| --- | --- | --- |
| director | 출시 목표, 우선순위, 의존성, 작업 배정, 사용자 판단 묶음 | 플레이 가능한 변화와 사전 완료 조건을 정의합니다. 원장의 최종 상태·승인은 총괄만 기록합니다. |
| design | 핵심 재미, 플레이 동선, 규칙·보상·성장, 범위 | 서사·월드·개발이 구현할 수 있는 규칙과 결과를 전달합니다. 현재 수치를 승인 없이 새로 정하지 않습니다. |
| narrative | 의뢰, NPC, 선택과 반응 | [서사 기준](../roles/NARRATIVE.md)에 따라 실제 서버 판정과 연결되는 콘텐츠를 전달합니다. |
| world | 지역, 소품, 배치, 충돌·가림·동선 | [월드 기준](../roles/WORLD_BUILDING.md)에 따라 원본·사용자 Transform·ID를 보존합니다. |
| character | 확정 외형, 파츠, 동작과 표현 | [캐릭터 기준](../roles/CHARACTER_ART.md)의 하이브리드 버전 1을 유지합니다. |
| development | 클라이언트·서버·UI·저장·게임 연결 | [개발 기준](../roles/DEVELOPMENT.md)에 따라 판정·표시·저장을 연결합니다. |
| quality | 독립 검토, 통합 인수, 보완 요청 | 제작 설명과 사전 완료 조건·실제 변경·증거를 직접 대조합니다. 정적 확인을 실제 플레이로 바꾸어 기록하지 않습니다. |

사용자님은 창작 방향·목표 범위·새 미술 방향·검증 위임·최종 공개를 결정하십니다. 제작 방법과 순서는 담당 조직과 총괄이 정하고, 품질 조직은 사전 완료 조건에 맞지 않는 결과를 반려합니다. 범위를 바꾸어야 하면 총괄이 추천안과 영향을 한 번에 전달합니다.

조직은 필요할 때 호출하는 책임 단위입니다. 앱에서는 총괄 1명·제작 최대 2명·검토 1명, 환경이 허용하는 범위에서 합계 최대 4명으로 운영합니다. 초기 CLI는 한 번에 제작자 또는 검토자 한 프로세스를 실행합니다. 두 제작자가 함께 일할 때에는 파일뿐 아니라 원본·관련 씬·등록·생성 산출물의 소유 범위가 겹치지 않아야 합니다. 공용 등록과 최종 연결은 한 담당자가 순서대로 처리합니다.

## 모델과 추론 비용

사용자님은 제한된 사용량 안에서 완료 품질을 충족하는 가장 경제적인 배정을 원하십니다. 정책 원본은 board.json의 settings.modelPolicy입니다. 아래는 프로젝트에서 비용·품질을 실측하기 전의 초기 기준이며, 실제 작업의 난도·오류 영향·재작업 비용을 우선합니다.

| 담당 | 기본 모델 | 추론 강도 |
| --- | --- | --- |
| 운영 총괄·기획 | GPT-6.1 Sol | xhigh |
| 서사 | GPT-6.1 Terra | low |
| 월드·캐릭터 | GPT-6.1 Terra | medium |
| 개발 | GPT-6.1 Sol | low |
| 독립 품질 검토 | GPT-6.1 Sol | medium |

- 상태 집계·파일 목록·명확한 치환은 로컬 도구나 총괄이 직접 처리합니다. 단순 발췌·분류·정형 초안에 모델이 필요하면 light(GPT-6 Luna/high)를 배정합니다. Luna의 high는 공식 권장 시작점입니다.
- 글 다듬기는 writing(Terra/low), 일반 제작은 standard(Terra/medium), 범위가 명확한 코드는 coding(Sol/low), 여러 모듈의 통합·원인 분석은 complex(Sol/medium), 저장·보상·동시성 등 오류 영향이 큰 판단은 critical(Sol/high)을 사용합니다. 운영 총괄·기획은 사용자 지정 planning(Sol/xhigh)을 기본으로 사용합니다. 다른 담당은 기존 절약 기준을 유지하며 최상위 모델과 max·ultra는 기본 배정하지 않습니다.
- 총괄이 task.modelProfile과 modelReason을 기록해 작업별 배정을 조정합니다. 검토를 다르게 배정할 때에는 reviewModelProfile과 reviewModelReason을 사용합니다. critical 작업은 검토에도 critical을 기본 적용합니다. 같은 전제의 실패를 반복하며 모델만 올리지 않고, 재개 전 원인·달라진 전제를 남깁니다.
- CLI는 제작·검토·요청 조정마다 --model과 model_reasoning_effort를 명시합니다. 설정과 이유는 실행별 *.execution.json에 남기며 status와 prompt에서도 확인할 수 있습니다. 새 실행부터 적용하며 이미 실행 중인 프로세스의 모델은 바뀌지 않습니다.
- 앱 handoff는 producerExecution·reviewerExecution을 반환하고 requested-execution.json에 요청 설정을 보존합니다. 총괄이 실제 호출에 이 설정을 전달합니다. 현재 도구처럼 전체 대화 상속 시 모델 변경이 제한되면 fork_turns:none으로 필요한 프롬프트와 근거만 전달합니다. 모델 지정을 지원하지 않는 도구에서는 적용했다고 보고하지 않습니다. 현재 총괄 대화의 모델은 사용자님의 모델 선택기에서 변경하며 문서나 handoff가 자동 전환하지 않습니다.
- 작은 작업은 에이전트를 새로 만들지 않고, 제작·독립 검토에는 필요한 자료만 전달합니다. 중복 전수 조사·불필요한 보고서·비교용 모델 호출을 줄입니다. 모델 정책 변경은 테스트·브라우저·게임 실행 권한을 확대하지 않습니다.

구독 한도의 정확한 차감률·절감률은 보장하지 않습니다. 실제 품질 부족·재작업이 관찰될 때 해당 배정을 조정합니다. 모델 정책이 없는 이전 원장은 Terra/medium으로 호환하며 작업별 프로필에는 원장의 정책이 필요합니다.

공식 근거: [OpenAI 모델 안내](https://learn.chatgpt.com/docs/models), [추론 설정](https://learn.chatgpt.com/docs/config-file/config-reference), [API 가격](https://developers.openai.com/api/docs/pricing). API 단가를 구독 차감률로 환산하지 않습니다. 확인일: 2026-11-05.

## 실제 시작 방법

저장소 루트의 PowerShell에서 실행해 주세요. Node와 기존 Codex CLI 인증을 사용하며 새 패키지·서비스는 설치하지 않습니다.

~~~powershell
node scripts/studio/studio.mjs status
node scripts/studio/studio.mjs validate
~~~

사용자님은 앱에서 다음처럼 시작하실 수도 있습니다.

> 제작 총괄로서 docs/studio/README.md와 board.json을 확인하고, 승인된 목표를 자율 진행해 주세요. 전문 조직에 작업을 나누고 독립 품질 검토까지 완료해 주세요. 승인 범위 밖의 판단은 추천안과 함께 묶어서 보고해 주세요.

첫 제작 전에는 [계약 초안](RELEASE_PLAN.md)의 M1 범위에 대해 사용자님의 판단을 원장에 반영합니다. 총괄은 관련 decisions를 resolved로 기록하고 선택 근거를 남깁니다. 목표의 scope·acceptance·allowedCapabilities·allowedChecks·artBriefs가 바로 승인할 계약입니다. 작업 에이전트가 스스로 승인·재개·최종 인수 명령을 실행하면 안 됩니다.

~~~powershell
node scripts/studio/studio.mjs status --goal M1
node scripts/studio/studio.mjs approve --goal M1 --by "사용자" --digest "<status의 계약 지문>"
node scripts/studio/studio.mjs run --goal M1 --minutes 90
~~~

승인 명령은 현재 원장에 적힌 계약만 승인합니다. 테스트·브라우저·빌드·내보내기는 기본적으로 비어 있는 allowedChecks에 사용자님이 위임한 정확한 명령을 기록한 뒤 승인합니다. 새 미술은 newArt뿐 아니라 승인된 시안과 제작 범위를 artBriefs에 연결합니다. 게시 승인도 대상·범위가 구체적인 명시 지시가 있어야 합니다. 계약을 바꾸면 지문이 달라져 재확인 전에는 실행되지 않습니다. 승인이 유효한 범위 안에서는 다시 묻지 않습니다.

90분은 초기 실행 한도이며 0 초과 90 이하로 줄일 수 있습니다. 한 번의 run은 최대 32회 작업 선택까지만 진행하고, 작업별 검토는 최대 2회까지 진행합니다. 완료·판단 필요·도구 부족·시간 한도에서 상태를 남깁니다. 예약 재개는 구성하지 않습니다. 중단 후 같은 run 명령을 사용하면 원장에서 이어받습니다.

## 작업과 조직 간 요청

[board.json](board.json)이 목표·작업·승인·결정·요청의 단일 원장입니다. 작업자는 자신의 결과 JSON만 제출하고, 총괄이 결과를 원장에 반영합니다.

- 목표: 범위, 완료 조건, 선행 목표, 승인자·시각·권한과 계약 지문을 갖습니다.
- 작업: ID, 플레이어 변화, 담당, 선행 작업, 읽기·수정 범위, 필요한 도구, 검증 명령, 완료 조건을 갖습니다.
- 상태: backlog → ready → active → review → done입니다. 진행할 수 없으면 blocked와 재개 조건을 기록합니다.
- 조직 간 요청: 작업 결과의 requests에 대상 조직·범위·선행 조건·완료 조건을 제출합니다. 총괄의 별도 읽기 전용 실행이 accept/defer/escalate를 결정합니다.
- 같은 목표의 승인 범위 안 요청은 의존성을 검증한 뒤 새 작업으로 배정합니다. 범위를 벗어나면 사용자 판단으로 올립니다. 범위 밖의 아이디어는 다음 목표 후보로 남깁니다.
- 차단 요청이 해결되면 실제 선행 작업 완료를 확인하고 원래 작업을 다시 준비합니다. 다른 독립 작업은 그동안 계속 진행합니다.
- 제작자는 완료를 제안하고, 별도 읽기 전용 Codex 실행의 검토자가 실제 근거를 확인해야 done이 됩니다. 목표 전체의 최종 인수는 사용자님의 별도 판단입니다.

예를 들어 온라인 처치 보상과 의뢰 집계가 다르면 기획이 기준을 전달하고 개발이 연결을 구현하며 서사가 안내를 맞춥니다. 품질은 서버·표시·저장 결과를 대조합니다. 목표 범위 안의 추가 작업은 사용자님이 하나하나 발주하지 않으셔도 됩니다.

작업별 실제 프롬프트를 읽기 전용으로 확인하실 수 있습니다.

~~~powershell
node scripts/studio/studio.mjs prompt --task DEMO-010
~~~

결과 계약은 scripts/studio/result.schema.json이며 제작자·검토자의 ID, 단계, 증거 파일, 실패 지문을 검증합니다. 총괄 조정 계약은 director.schema.json입니다. completed에는 실제 파일 근거가 필요하고, 근거의 존재만으로 내용의 정확성이 보장되는 것은 아니므로 독립 검토가 직접 대조합니다.

## 보존·실행 한도·중단 복구

실행마다 .runtime/studio/runs/에 Git 변경 목록, 작업 전 원본 바이트·SHA-256, 프롬프트, CLI 이벤트·오류·결과를 남깁니다. 원본 백업은 구체적으로 지정한 작업 수정 범위만 대상으로 하며 자동 복원하지 않습니다. src나 godot-arcana 전체처럼 넓은 백업은 거부합니다. .env·자격 증명·캐시·작업 공간 밖 링크는 백업 대상이 아닙니다. 기록은 기존 .runtime/ 무시 규칙을 따르며 실행 기록 전체를 기본 탐색에 포함하지 않습니다.

기존 작업본과 미추적 자산은 그대로 출발점으로 삼습니다. 새 worktree에 현재 변경이 따라간다고 가정하거나, 정리를 위해 reset·일괄 커밋하지 않습니다.

원장의 변경과 실제 실행은 같은 .runtime/studio/lock.json을 사용합니다. 앱 총괄도 실행 소유권을 확보하고, 모든 작업을 회수한 뒤 해제해야 합니다. CLI 실행 중 앱이 원장을 직접 편집하지 않습니다. 앱 총괄은 CLI를 작업 실행 수단으로 사용하거나, 아래 엔진 API로 같은 잠금을 확보해 직접 조직을 운영할 수 있습니다. CLI를 실행할 때 앱이 별도로 잠금을 중첩 획득하지 않습니다.

- engine.mjs: acquireLock/releaseLock, readBoard/writeBoard, transitionTask, selectTask, captureBaseline
- protocol.mjs: assertTaskAuthorized, formatTaskPrompt, validateResult
- 앱 직접 실행도 결과를 보존하고 별도 검토를 거칩니다. 앱 전용 작업은 CLI가 실행하지 않고 blockKind:app으로 남깁니다. handoff가 작업 전 백업과 앱용 프롬프트를 만들고, report가 제작자·별도 검토자 JSON을 확인한 뒤 원장에 반영합니다. 앱 작업이 active인 동안 CLI run은 시작하지 않습니다.

앱 총괄은 다음 경로로 인계·인수할 수 있습니다. JSON 경로는 handoff가 만든 실행 디렉터리 아래의 실제 workspace 상대경로를 사용합니다. 앱 총괄이 제작자와 검토자를 따로 호출하고 각 응답을 별도 파일로 보존합니다.

~~~powershell
node scripts/studio/studio.mjs handoff --task "<작업 ID>" --by "앱 총괄"
node scripts/studio/studio.mjs prompt --task "<작업 ID>" --phase reviewer --producer "<제작 결과 JSON>"
node scripts/studio/studio.mjs report --task "<작업 ID>" --by "앱 총괄" --producer "<제작 결과 JSON>" --review "<독립 검토 JSON>"
~~~

실제 발주용 prompt는 목표 승인과 권한을 확인한 뒤에만 출력합니다. report는 결과 형식·실재 경로·ID·단계를 확인하지만 앱의 두 응답이 실제로 독립 작성되었는지는 앱 총괄이 책임집니다. blocked 제작 결과를 보고할 때에는 review 파일이 필요하지 않습니다.

active 상태에서 중단된 작업은 자동으로 다시 제작하지 않습니다. 기존 변경과 기록을 확인하고 달라진 전제를 적어 재개합니다. review 상태의 정상적인 시간 한도·사용자 중단은 제작을 반복하지 않고 검토부터 재개합니다. 잘못된 결과·실행 실패는 실패 지문과 함께 보류합니다.

~~~powershell
node scripts/studio/studio.mjs retry --task "<작업 ID>" --by "사용자" --reason "<환경·원본·선행 조건에서 달라진 점>"
node scripts/studio/studio.mjs unlock
node scripts/studio/studio.mjs accept --goal M1 --by "사용자" --reason "<직접 인수한 결과와 알려진 제약>"
~~~

unlock은 같은 호스트에서 소유 PID가 종료된 잠금만 해제합니다. 살아 있는 실행·다른 호스트·판단할 수 없는 잠금은 자동 제거하지 않습니다. 승인 범위 안의 단순 중단 복구는 총괄이 변경된 전제를 확인하여 진행할 수 있지만, 범위·검증·새 미술·공개 권한을 확대해서는 안 됩니다.

수정 범위와 개별 검증 명령은 운영 계약입니다. Codex workspace-write의 OS 경계는 작업 공간이며, 이 실행기는 파일별 쓰기나 개별 셸 명령을 보안 격리하지 않습니다. 기술적으로 강제하는 항목은 원장/의존성 검증, 승인 전 실행 거부, 결과 계약, 실제 근거 경로, 잠금, 시간 한도, 읽기 전용 검토 프로세스입니다. 조직 지침이 샌드박스·상위 승인 정책을 대신하지 않습니다.

## 확인과 인수

이번 구축에서는 문서·참조·JSON·JavaScript 구문과 독립 정적 검토만 확인합니다. 라이브 Codex 작업·게임·테스트·브라우저·빌드는 실행하지 않습니다. 검토 근거는 [구축 인수 기록](IMPLEMENTATION_REVIEW.md)에 남깁니다.

직접 운영 모듈을 확인하시려면 다음 명령을 사용하실 수 있습니다. 임시 fixture 안에서만 동작하며 Codex 모델·게임·DB를 호출하지 않습니다.

~~~powershell
node --test tests/studio-organization.test.mjs
~~~

확인할 핵심은 미승인 목표 차단, 의존성·순환 검사, 독립 검토 증거, 기존 원본 백업, 중복 실행 잠금, 경로 탈출 차단입니다. 전체 동선과 재미·미술 체감·공개 판단은 출시 계약에 따라 이후 목표에서 인수합니다.


## 모바일 웹 제작실

휴대폰에서 운영하실 때에는 [모바일 제작실 안내](WEB_CONSOLE.md)를 사용합니다. 웹의 지시함과 PC 연결기는 기존 원장·승인·모델 정책·독립 검토를 함께 사용합니다.
