# 모바일 제작실 운영

[아르카나 제작실](https://arcana-production-desk-bang.seoulprince.chatgpt.site)에 본인 계정으로 로그인하여 휴대폰에서 운영합니다. 브라우저의 ‘홈 화면에 추가’를 사용하면 아이콘으로 바로 열 수 있습니다. 첫 버전 알림은 웹의 지시함·배지로 제공하며 푸시는 후속 범위입니다.

## 처음 한 번 연결

1. 웹의 **PC 연결**에서 연결 코드를 만듭니다. 코드는 10분 동안 한 번만 사용할 수 있습니다.
2. 이 PC의 서비스 접근 설정은 Codex가 Windows 사용자 계정으로 암호화하여 준비합니다. 화면이나 소스에 서비스 토큰을 복사하지 않습니다.
3. 코드로 아래 pair 명령을 수행한 뒤 숨김 연결기를 시작합니다. 현재 Codex 대화에 코드만 전달하셔도 이 단계를 맡기실 수 있습니다.

~~~powershell
node scripts/studio/bridge.mjs pair --site https://arcana-production-desk-bang.seoulprince.chatgpt.site --code <연결코드>
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/studio/start-bridge.ps1
~~~

이후에는 웹앱에서 지시합니다. Codex 앱 화면을 열어 둘 필요는 없지만 작업 PC와 연결기는 실행 중이어야 합니다. PC가 꺼지면 마지막 확인 상태가 표시되고 지시는 대기합니다. 새 PC를 연결하면 이전 기기와 미확인 실행 상태를 자동 재실행하지 않습니다.

## 모바일 사용

- **홈:** 목표·진행 작업·실제 동작·최근 결과와 연결 상태를 확인합니다.
- **부서:** 총괄·기획·서사·월드·캐릭터·개발·품질과 대화합니다. 실제 작업 지시는 승인 목표 안에서 배정하며, 같은 부서의 진행 중 작업에는 추가 지시를 전달합니다.
- **지시함:** 접수·실행·완료·확인 필요를 구분하고 목표 승인, 판단 답변, 실제 Codex 승인 요청을 처리합니다.
- **사용량:** 계정 전체의 반환된 한도만 보여줍니다. 초기화 예정 시각·마지막 갱신·초기화권 보유량을 표시하며 토큰을 구독 잔여량으로 환산하지 않습니다.

‘다음 작업부터 일시정지’는 현재 작업 인수 뒤에 멈춥니다. ‘현재 작업 중단’은 진행 중 작업의 중단을 요청하며 부분 변경을 보존합니다. 미승인 목표·새 미술·검증·공개 권한은 웹 메시지만으로 확대하지 않습니다. 승인 화면의 구체적인 계약과 검증 범위를 확인합니다.

## PC 연결기 완전 종료

웹의 연결 상태 설정에서 **PC 연결기 완전 종료**를 선택하면 현재 작업을 중단하고 Codex 자식 프로세스와 PC 연결기까지 종료합니다. 상태 동기화와 사용량 조회도 멈춥니다. 사이트와 과거 기록은 계속 열 수 있습니다.

완전히 종료한 PC 프로그램은 웹에서 다시 켤 수 없습니다. PC에서 start-bridge.ps1을 실행하시면 기존 기기 등록을 재사용하므로 연결 코드를 다시 입력하지 않습니다. Windows 자동 시작은 기본으로 등록하지 않습니다.

## PC 연결기 관리

~~~powershell
node scripts/studio/bridge.mjs status
node scripts/studio/bridge.mjs stop
~~~

Windows 로그인 시 자동 연결을 원하실 때만 다음을 선택합니다.

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/studio/start-bridge.ps1 -AutoStart
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/studio/start-bridge.ps1 -DisableAutoStart
~~~

비밀 설정은 .runtime/studio/bridge-secrets.json에 DPAPI 암호문으로 저장되며 해당 Windows 사용자만 복호화합니다. bridge-config.json은 주소·기기 식별정보만, bridge-state.json은 지시 처리·영속 outbox를 보관합니다. 비밀·원본 인증 파일·개인 저장을 클라우드에 보내지 않습니다. bridge.stdout.log/bridge.stderr.log는 필요한 연결 문제에서만 확인합니다.

## 구조와 확인 범위

웹 소스는 sites/arcana-studio의 독립 Sites 저장소이며 게임 저장소를 게시하지 않습니다. D1은 연결·지시·메시지·최근 snapshot을 저장하고 로컬 원장은 기존 조직 운영의 기준으로 유지합니다. PC는 HTTPS로만 외부 연결하며 인터넷 공개 포트를 열지 않습니다.

구축 확인은 JavaScript·PowerShell 구문, 웹 타입, D1 마이그레이션 구조와 사이트 산출물 빌드입니다. 브라우저·게임·모델 시범 실행·자동 테스트는 별도 요청 전에는 수행하지 않습니다. 실제 PC 등록과 상주 기동은 사용자가 생성한 연결 코드로 수행하는 운영 단계입니다.
