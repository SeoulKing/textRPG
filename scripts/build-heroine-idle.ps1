param([switch]$Publish)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=Join-Path $root '.runtime/godot/heroine-idle-v1-stage'
$outputDir=Join-Path $root '.runtime/godot/heroine-idle-v1-web'
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
New-Item -ItemType Directory -Force $stage,$outputDir | Out-Null
& robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Runtime copy failed'}
$project=Join-Path $stage 'project.godot'
$text=[IO.File]::ReadAllText($project)
$text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($project,$text)
$preset=Join-Path $stage 'export_presets.cfg'
$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($preset,$text)
foreach($step in @('import','export')) {
 $arguments=@('--headless','--path',$stage,'--log-file',(Join-Path $root ('.runtime/godot/idle-'+$step+'-engine.log')))
 if($step -eq 'import'){$arguments+=@('--editor','--import','--quit')}else{$arguments+=@('--export-release','Web',(Join-Path $outputDir 'index.html'))}
 $ErrorActionPreference='Continue'
 $output=@(& $godot @arguments 2>&1 | ForEach-Object{"$_"}); $code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output | Set-Content -Encoding utf8 (Join-Path $root ('.runtime/godot/idle-'+$step+'.log'))
 $errors=$output | Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors | Select-Object -First 10 | Write-Output;throw "Idle $step failed"}
}
Write-Output "Idle Web build: $outputDir"
$render=Join-Path $root '.runtime/godot/heroine-idle-v1-render'
New-Item -ItemType Directory -Force $render | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$godot
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['APPDATA']=Join-Path $render 'appdata'
$start.EnvironmentVariables['LOCALAPPDATA']=Join-Path $render 'localappdata'
foreach($arg in @('--path',$stage,'--log-file',(Join-Path $render 'engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_heroine_idle.gd')){$start.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($start)
$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Idle art capture exceeded 55 seconds'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $render 'render.log'),$log)
$errors=$log -split "`n" | Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw 'Idle art capture failed'}
if($Publish){
 Copy-Item -Path (Join-Path $outputDir 'index.*') -Destination (Join-Path $root 'godot-web') -Force
 Write-Output 'Published local Web files.'
}
