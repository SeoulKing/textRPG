param([ValidateSet('before','after')][string]$Stage='after', [switch]$CharacterQuality, [switch]$NaturalWalk, [string]$ProjectPath="godot-arcana")
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
foreach($arg in @('--path',$ProjectPath,'--log-file',(Join-Path $runtimeRoot ('reference-'+$Stage+'-engine.log')),'--rendering-method','gl_compatibility','--script','res://tools/render_reference_scene.gd','--',('--stage='+$Stage))){$startInfo.ArgumentList.Add($arg)}
if($NaturalWalk){$startInfo.ArgumentList.Add('--natural-walk')}
if($CharacterQuality){$startInfo.ArgumentList.Add('--character-quality')}
$process=[Diagnostics.Process]::Start($startInfo)
$stdout=$process.StandardOutput.ReadToEndAsync()
$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Reference GPU capture exceeded 55 seconds.'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $runtimeRoot ('reference-'+$Stage+'.log')),$log)
$errors=$log -split "`n" | Where-Object {$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors | Select-Object -First 10 | Write-Output;throw 'Reference capture failed; inspect .runtime/godot/reference-stage.log.'}
Write-Output ('Reference GPU captures: '+$Stage)
