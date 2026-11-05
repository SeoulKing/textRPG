param([ValidateSet('Native','Capture','Import','Export')][string]$Action,[string]$Stage='before',[string]$ProjectPath='godot-arcana')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRun=Join-Path $root '.runtime/godot/outdoor-unified-v1'
$appData=Join-Path $taskRun 'appdata'
$localData=Join-Path $taskRun 'localappdata'
foreach($folder in @($taskRun,$appData,$localData,(Join-Path $appData 'Godot/app_userdata/아르카나'),(Join-Path $root 'art-studies/outdoor-unified-v1/renders'))){New-Item -ItemType Directory -Force $folder|Out-Null}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$root
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=$appData
$info.EnvironmentVariables['LOCALAPPDATA']=$localData
$arguments=@('--path',$ProjectPath,'--log-file',(Join-Path $taskRun ($Action+'-'+$Stage+'-engine.log')))
switch($Action){
 'Native'{$arguments+=@('--headless','--script','res://tools/author_outdoor_unified.gd')}
 'Capture'{$arguments+=@('--rendering-method','gl_compatibility','--script','res://tools/render_outdoor_unified.gd','--',('--out='+(Join-Path $root 'art-studies/outdoor-unified-v1/renders')),('--stage='+$Stage))}
 'Import'{$arguments+=@('--headless','--editor','--import','--quit')}
 'Export'{$arguments+=@('--headless','--export-release','Web',(Join-Path $taskRun 'web/index.html'));New-Item -ItemType Directory -Force (Join-Path $taskRun 'web')|Out-Null}
}
foreach($arg in $arguments){$info.ArgumentList.Add($arg)}
$job=[Diagnostics.Process]::Start($info)
$stdout=$job.StandardOutput.ReadToEndAsync();$stderr=$job.StandardError.ReadToEndAsync()
if(-not $job.WaitForExit(55000)){$job.Kill();throw ($Action+' exceeded 55 seconds')}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $taskRun ($Action+'-'+$Stage+'.log')),$log)
$errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($job.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 8;throw ($Action+' failed; inspect task log')}
$log -split "`n"|Where-Object{$_ -match 'PIXELPEN_OUTDOOR|OUTDOOR_CAPTURE'}|Select-Object -Last 5
'Completed '+$Action+' '+$Stage
