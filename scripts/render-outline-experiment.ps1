$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot=Join-Path $projectRoot '.runtime/godot'
$startInfo=[Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName=Join-Path $runtimeRoot 'Godot_v4.5.1-stable_win64_console.exe'
$startInfo.WorkingDirectory=$projectRoot
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$startInfo.RedirectStandardOutput=$true
$startInfo.RedirectStandardError=$true
$startInfo.EnvironmentVariables['APPDATA']=Join-Path $runtimeRoot 'appdata'
$startInfo.EnvironmentVariables['LOCALAPPDATA']=Join-Path $runtimeRoot 'localappdata'
foreach($arg in @('--path','godot-arcana','--log-file',(Join-Path $runtimeRoot 'outline-experiment-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_outline_experiment.gd')){$startInfo.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($startInfo)
$stdout=$process.StandardOutput.ReadToEndAsync()
$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Outline experiment GPU capture exceeded 55 seconds.'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'outline-experiment-render.log'),$log)
$errors=$log -split "\n" | Where-Object {$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors | Select-Object -First 8 | Write-Output;throw 'Outline experiment capture failed; inspect .runtime/godot/outline-experiment-render.log.'}
Write-Output $log


