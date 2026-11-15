param(
  [switch]$AutoStart,
  [switch]$DisableAutoStart
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskBridge = Join-Path $taskRoot 'scripts/studio/bridge.mjs'
$taskRuntime = [IO.Path]::GetFullPath((Join-Path $taskRoot '.runtime/studio'))
if (-not $taskRuntime.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
  throw '실행 기록 경로가 작업 공간 안에 있어야 합니다.'
}
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $taskBridge)) { throw 'PC 연결 프로그램을 찾지 못했습니다.' }
$taskName = 'ArcanaStudioBridge'
if ($DisableAutoStart) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output 'Windows 로그인 시 자동 연결을 해제했습니다.'
  exit 0
}
if ($AutoStart) {
  $taskPowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $taskLauncher = Join-Path $taskRoot 'scripts/studio/start-bridge.ps1'
  $taskAction = New-ScheduledTaskAction -Execute $taskPowerShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $taskLauncher + '"') -WorkingDirectory $taskRoot
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
  Write-Output '현재 Windows 사용자 로그인 시 자동 연결하도록 설정했습니다.'
}
[IO.Directory]::CreateDirectory($taskRuntime) | Out-Null
$taskArguments = @('"' + $taskBridge + '"','start')
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'bridge.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'bridge.stderr.log')
Write-Output ('PC 연결 프로그램을 백그라운드로 시작했습니다. PID: ' + $taskProcess.Id)
