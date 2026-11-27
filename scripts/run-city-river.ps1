param([ValidateSet('Author','Navy','Daylight','Candidates','Choice1','Pixels','Render')][string]$Action='Author',[string]$ProjectPath='godot-arcana',[string]$ResourcePack='')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRun=Join-Path $taskRoot '.runtime/godot/city-river-v1'
$taskAppData=Join-Path $taskRun 'appdata'
$taskLocalData=Join-Path $taskRun 'localappdata'
foreach($folder in @($taskRun,$taskAppData,$taskLocalData)){New-Item -ItemType Directory -Force -Path $folder|Out-Null}
$processInfo=[Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName=Join-Path $taskRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$processInfo.WorkingDirectory=$taskRoot
$processInfo.UseShellExecute=$false
$processInfo.CreateNoWindow=$true
$processInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$processInfo.RedirectStandardOutput=$true
$processInfo.RedirectStandardError=$true
$processInfo.EnvironmentVariables['APPDATA']=$taskAppData
$processInfo.EnvironmentVariables['LOCALAPPDATA']=$taskLocalData
$taskArguments=@('--path',$ProjectPath,'--log-file',(Join-Path $taskRun ($Action+'-engine.log')))
if($Action -eq 'Author'){$taskArguments+=@('--headless','--script','res://tools/author_city_river.gd')}
elseif($Action -eq 'Navy'){$taskArguments+=@('--headless','--script','res://tools/author_river_navy.gd')}
elseif($Action -eq 'Daylight'){$taskArguments+=@('--headless','--script','res://tools/author_river_daylight.gd')}
elseif($Action -eq 'Candidates'){$taskArguments+=@('--rendering-method','gl_compatibility','--script','res://tools/render_river_candidates.gd')}
elseif($Action -eq 'Choice1'){$taskArguments+=@('--headless','--script','res://tools/apply_river_choice.gd')}
elseif($Action -eq 'Pixels'){$taskArguments+=@('--headless','--script','res://tools/author_river_pixels.gd')}
else{$taskArguments+=@('--rendering-method','gl_compatibility','--script','res://tools/render_city_river.gd');if($ResourcePack){$taskArguments+=@('--',('--pack='+$ResourcePack))}}
foreach($argument in $taskArguments){$processInfo.ArgumentList.Add($argument)}
$taskProcess=[Diagnostics.Process]::Start($processInfo)
$taskStdout=$taskProcess.StandardOutput.ReadToEndAsync()
$taskStderr=$taskProcess.StandardError.ReadToEndAsync()
if(-not $taskProcess.WaitForExit(55000)){$taskProcess.Kill();throw ($Action+' exceeded 55 seconds')}
$taskLog=$taskStdout.Result+$taskStderr.Result
[IO.File]::WriteAllText((Join-Path $taskRun ($Action+'.log')),$taskLog)
$taskErrors=$taskLog -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($taskProcess.ExitCode -ne 0 -or $taskErrors){$taskErrors|Select-Object -First 8;throw ($Action+' failed; inspect task log')}
$taskLog -split "`n"|Where-Object{$_ -match 'RIVER_'}
