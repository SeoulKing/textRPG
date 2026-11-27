param([string]$ProjectPath, [string]$OutputPath, [string]$ResourcePack='')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..'))
$taskRun=Join-Path $taskRoot '.runtime/godot/city-walk-render'
New-Item -ItemType Directory -Force -Path $taskRun | Out-Null
$taskInfo=[Diagnostics.ProcessStartInfo]::new()
$taskInfo.FileName=Join-Path $taskRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$taskInfo.WorkingDirectory=$taskRoot
$taskInfo.UseShellExecute=$false
$taskInfo.CreateNoWindow=$true
$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskInfo.RedirectStandardOutput=$true
$taskInfo.RedirectStandardError=$true
$taskInfo.EnvironmentVariables['APPDATA']=Join-Path $taskRun 'appdata'
$taskInfo.EnvironmentVariables['LOCALAPPDATA']=Join-Path $taskRun 'localdata'
foreach($taskArg in @('--path',$ProjectPath,'--log-file',(Join-Path $taskRun 'engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_city_walk.gd','--',('--out='+$OutputPath))){$taskInfo.ArgumentList.Add($taskArg)}
if($ResourcePack){$taskInfo.ArgumentList.Add('--pack='+$ResourcePack)}
$taskProcess=[Diagnostics.Process]::Start($taskInfo)
$taskOut=$taskProcess.StandardOutput.ReadToEndAsync()
$taskErr=$taskProcess.StandardError.ReadToEndAsync()
if(-not $taskProcess.WaitForExit(55000)){$taskProcess.Kill();throw 'City render exceeded 55 seconds'}
$taskLog=$taskOut.Result+$taskErr.Result
[IO.File]::WriteAllText((Join-Path $taskRun 'render.log'),$taskLog)
$taskErrors=$taskLog -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($taskProcess.ExitCode -ne 0 -or $taskErrors){$taskErrors|Select-Object -First 12;throw 'City render failed'}
$taskLog -split "`n"|Where-Object{$_ -match 'CITY_WALK_RENDER'}