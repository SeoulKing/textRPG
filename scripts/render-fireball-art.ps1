param([switch]$Lighting, [string]$StagePath = "")
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage = if ($StagePath) { $StagePath } else { [IO.File]::ReadAllText((Join-Path $projectRoot '.runtime/godot/fixed-legs-stage-path.txt')).Trim() }
$previewTool = if ($Lighting) { 'render_fireball_lighting.gd' } else { 'render_fireball_vfx.gd' }
Copy-Item -LiteralPath (Join-Path $projectRoot ('godot-arcana/tools/'+$previewTool)) -Destination (Join-Path $stage ('tools/'+$previewTool))
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = Join-Path $projectRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.EnvironmentVariables['APPDATA'] = Join-Path $projectRoot '.runtime/godot/appdata'
$startInfo.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $projectRoot '.runtime/godot/localappdata'
foreach ($argument in @('--path',$stage,'--log-file',(Join-Path $projectRoot '.runtime/godot/fireball-art-engine.log'),'--rendering-method','gl_compatibility','--script',$(if ($Lighting) { 'res://tools/render_fireball_lighting.gd' } else { 'res://tools/render_fireball_vfx.gd' }))) { $startInfo.ArgumentList.Add($argument) }
$process = [Diagnostics.Process]::Start($startInfo)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit(45000)) { $process.Kill(); throw 'Fireball art render exceeded 45 seconds.' }
$log = $stdout.Result + $stderr.Result
[IO.File]::WriteAllText((Join-Path $projectRoot '.runtime/godot/fireball-art.log'),$log)
$errors = $log -split "`n" | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.' }
if ($process.ExitCode -ne 0 -or $errors) { $errors | Select-Object -First 10; throw 'Fireball art rendering failed.' }
Write-Output 'Rendered: godot-arcana/art/reference/fireball-v1/'
