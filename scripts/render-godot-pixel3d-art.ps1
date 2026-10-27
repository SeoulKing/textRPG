param([string]$GodotPath = "", [switch]$Trees, [switch]$Hud)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $GodotPath) { $GodotPath = Join-Path $projectRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe' }
if (-not (Test-Path -LiteralPath $GodotPath)) { throw 'The existing Godot 4.5.1 runtime is required.' }
$renderRoot = Join-Path $projectRoot '.runtime/godot'
$appDataRoot = Join-Path $renderRoot 'appdata'
$localDataRoot = Join-Path $renderRoot 'localappdata'
New-Item -ItemType Directory -Force -Path $appDataRoot,$localDataRoot | Out-Null
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $GodotPath
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.EnvironmentVariables['APPDATA'] = $appDataRoot
$startInfo.EnvironmentVariables['LOCALAPPDATA'] = $localDataRoot
$previewScript = if ($Hud) { 'res://tools/render_hud.gd' } elseif ($Trees) { 'res://tools/render_trees.gd' } else { 'res://tools/render_pixel3d_preview.gd' }
foreach ($argument in @('--path','godot-arcana','--log-file',(Join-Path $renderRoot 'pixel3d-engine.log'),'--rendering-method','gl_compatibility','--script',$previewScript)) {
    $startInfo.ArgumentList.Add($argument)
}
$renderProcess = [Diagnostics.Process]::Start($startInfo)
$stdout = $renderProcess.StandardOutput.ReadToEndAsync()
$stderr = $renderProcess.StandardError.ReadToEndAsync()
if (-not $renderProcess.WaitForExit(45000)) { $renderProcess.Kill(); throw 'Offline art rendering exceeded 45 seconds.' }
$renderLog = $stdout.Result + $stderr.Result
$logPath = Join-Path $renderRoot 'pixel3d-preview.log'
[IO.File]::WriteAllText($logPath,$renderLog)
$errors = $renderLog -split "`n" | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.' }
if ($renderProcess.ExitCode -ne 0 -or $errors) { $errors | Select-Object -First 8 | Write-Output; throw "Offline art rendering failed; see $logPath" }
if ($Hud) { Write-Output 'Rendered HUD: godot-arcana/art/reference/hud-mobile.png, hud-wide.png'; return }
if ($Trees) { Write-Output 'Rendered offline tree study: godot-arcana/art/reference/trees-3d-study.png'; return }
Write-Output 'Rendered offline art: godot-arcana/art/reference/pixel3d-plaza.png, pixel3d-plaza-native.png, pixel3d-city-overview.png, pixel3d-interior.png, pixel3d-garden.png, pixel3d-character-detail.png, pixel3d-fountain.png'
