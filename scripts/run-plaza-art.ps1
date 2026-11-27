param([ValidateSet('Render','Author','Import','Pack','Combat','Export')][string]$Action, [string]$Stage='before', [string]$ProjectPath='godot-arcana', [string]$OutputDirectory='', [string]$ResourcePack='')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRun=Join-Path $taskRoot '.runtime/godot/plaza-mood-v1'
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
$taskArguments=@('--path',$ProjectPath,'--log-file',(Join-Path $taskRun ($Action+'-'+$Stage+'-engine.log')))
switch($Action){
 'Render'{$taskArguments+=@('--rendering-method','gl_compatibility','--script','res://tools/render_plaza_mood.gd','--',('--stage='+$Stage))}
 'Export'{$taskArguments+=@('--headless','--export-release','Web',(Join-Path $OutputDirectory 'index.html'))}
 'Combat'{$taskArguments+=@('--headless','--script','res://tools/export_combat_layout.gd')}
 'Pack'{$taskArguments+=@('--headless','--script','res://tools/package_plaza_ground.gd')}
 'Author'{$taskArguments+=@('--headless','--script','res://tools/author_plaza_mood.gd')}
 'Import'{$taskArguments+=@('--headless','--editor','--import','--quit')}
}
if($Action -eq 'Render' -and $OutputDirectory){$taskArguments+=('--out=' + $OutputDirectory)}
if($Action -eq 'Render' -and $ResourcePack){$taskArguments+=('--pack=' + $ResourcePack)}
foreach($argument in $taskArguments){$processInfo.ArgumentList.Add($argument)}
$taskProcess=[Diagnostics.Process]::Start($processInfo)
$taskStdout=$taskProcess.StandardOutput.ReadToEndAsync()
$taskStderr=$taskProcess.StandardError.ReadToEndAsync()
if(-not $taskProcess.WaitForExit(55000)){$taskProcess.Kill();throw ($Action+' exceeded 55 seconds')}
$taskLog=$taskStdout.Result+$taskStderr.Result
[IO.File]::WriteAllText((Join-Path $taskRun ($Action+'-'+$Stage+'.log')),$taskLog)
$taskErrors=$taskLog -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($taskProcess.ExitCode -ne 0 -or $taskErrors){$taskErrors|Select-Object -First 8;throw ($Action+' failed; inspect task log')}
$taskLog -split "`n"|Where-Object{$_ -match 'PLAZA_ART_|PLAZA_PIXELPEN'}
