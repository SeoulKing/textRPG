param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('Protect','Unprotect')]
  [string]$Action
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$taskEncoding = New-Object System.Text.UTF8Encoding($false)
$taskInput = [Console]::In.ReadToEnd()
$taskEntropy = $taskEncoding.GetBytes('ArcanaStudioBridge.v1')
try {
  if ($Action -eq 'Protect') {
    $taskBytes = $taskEncoding.GetBytes($taskInput)
    $taskEncrypted = [System.Security.Cryptography.ProtectedData]::Protect(
      $taskBytes, $taskEntropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($taskEncrypted))
    [Array]::Clear($taskBytes,0,$taskBytes.Length)
  } else {
    $taskEncrypted = [Convert]::FromBase64String($taskInput.Trim())
    $taskBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $taskEncrypted, $taskEntropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write($taskEncoding.GetString($taskBytes))
    [Array]::Clear($taskBytes,0,$taskBytes.Length)
  }
} catch {
  [Console]::Error.WriteLine('현재 Windows 사용자로 PC 연결 자격을 처리할 수 없습니다.')
  exit 1
}
